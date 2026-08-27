import { convertVideoFrameToImageData } from './utils/misc';
export default class WebcamClient {
    private videoElement: HTMLVideoElement;
    private stream?: MediaStream;
    private frameCallback?: (frame: ImageData, timestamp: number) => Promise<void>;

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

            // Start video playback. Uses addEventListener (not
            // onloadedmetadata) so we don't clobber a handler a consumer may
            // have already assigned to the same video element.
            this.videoElement.addEventListener('loadedmetadata', () => {
                this.videoElement.play();
            });

            this.videoElement.addEventListener('loadeddata', () => {
                this._processFrames();
            });

        } catch (error) {
            console.error("Error accessing the webcam:", error);
        }
    }

    stopWebcam(): void {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = undefined;
        }
    }

    private _processFrames(): void {
        const process = async () => {
            if (!this.videoElement || this.videoElement.paused || this.videoElement.ended) return;

            // Convert the current video frame to ImageData
            const imageData = convertVideoFrameToImageData(this.videoElement);

            // Call the frame callback if provided
            if (this.frameCallback) {
                await this.frameCallback(imageData, this.videoElement.currentTime);
            }

            // Request the next frame
            requestAnimationFrame(process);
        };

        requestAnimationFrame(process);
    }
}