import { IDisposable } from './IDisposable';

export default class WebcamClient implements IDisposable {
    private videoElement: HTMLVideoElement;
    private stream?: MediaStream;
    private frameCallback?: (frame: ImageData, timestamp: number) => Promise<void>;
    private animationFrameId: number | null = null;
    private loadedDataHandler: (() => void) | null = null;
    private _disposed: boolean = false;
    private cachedCanvas: HTMLCanvasElement | null = null;
    private cachedContext: CanvasRenderingContext2D | null = null;

    constructor(videoElementId: string) {
        const videoElement = document.getElementById(videoElementId) as HTMLVideoElement;
        if (!videoElement) {
            throw new Error(`Video element with id '${videoElementId}' not found`);
        }
        this.videoElement = videoElement;
    }

    async startWebcam(frameCallback?: (frame: ImageData, timestamp: number) => Promise<void>): Promise<void> {
        try {
            const constraints: MediaStreamConstraints = {
                video: {
                    // width: { ideal: 1280 },
                    // height: { ideal: 720 },
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: "user"
                },
                audio: false
            };

            // Request webcam access
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = this.stream;

            // Set the callback if provided
            if (frameCallback) {
                this.frameCallback = frameCallback;
            }

            // Start video playback
            this.videoElement.onloadedmetadata = () => {
                this.videoElement.play();
            };

            // Store handler reference for cleanup
            this.loadedDataHandler = () => {
                this._processFrames();
            };
            this.videoElement.addEventListener('loadeddata', this.loadedDataHandler);

        } catch (error) {
            console.error("Error accessing the webcam:", error);
        }
    }

    stopWebcam(): void {
        // Cancel pending animation frame
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Remove event listener
        if (this.loadedDataHandler) {
            this.videoElement.removeEventListener('loadeddata', this.loadedDataHandler);
            this.loadedDataHandler = null;
        }

        // Stop media stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.videoElement.srcObject = null;
            this.stream = undefined;
        }
    }

    private _processFrames(): void {
        const process = async () => {
            if (!this.videoElement || this.videoElement.paused || this.videoElement.ended) {
                this.animationFrameId = null;
                return;
            }

            // Convert the current video frame to ImageData using cached canvas
            const imageData = this.convertVideoFrameToImageData(this.videoElement);

            // Call the frame callback if provided
            if (this.frameCallback) {
                await this.frameCallback(imageData, this.videoElement.currentTime);
            }

            // Request the next frame and store the ID
            this.animationFrameId = requestAnimationFrame(process);
        };

        this.animationFrameId = requestAnimationFrame(process);
    }

    /**
     * Converts video frame to ImageData using a cached canvas for performance.
     * Canvas is created once and reused across all frames unless video dimensions change.
     */
    private convertVideoFrameToImageData(frame: HTMLVideoElement): ImageData {
        const width = frame.videoWidth;
        const height = frame.videoHeight;

        // Handle invalid dimensions (video not ready)
        if (width === 0 || height === 0) {
            throw new Error('Video frame has invalid dimensions. Video may not be ready.');
        }

        // Create canvas only once or when dimensions change
        if (!this.cachedCanvas ||
            this.cachedCanvas.width !== width ||
            this.cachedCanvas.height !== height) {

            this.cachedCanvas = document.createElement('canvas');
            this.cachedCanvas.width = width;
            this.cachedCanvas.height = height;

            // willReadFrequently hint optimizes for repeated getImageData() calls
            this.cachedContext = this.cachedCanvas.getContext('2d', {
                willReadFrequently: true
            })!;
        }

        // Reuse existing canvas and context
        this.cachedContext!.drawImage(frame, 0, 0);
        return this.cachedContext!.getImageData(0, 0, width, height);
    }

    /**
     * Disposes all resources including media streams and event listeners.
     */
    dispose(): void {
        if (this._disposed) {
            return;
        }

        this.stopWebcam();
        this.frameCallback = undefined;

        // Clean up cached canvas resources
        this.cachedCanvas = null;
        this.cachedContext = null;

        this._disposed = true;
    }

    /**
     * Returns true if dispose() has been called.
     */
    get isDisposed(): boolean {
        return this._disposed;
    }
}