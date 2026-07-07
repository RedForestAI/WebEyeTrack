/**
 * Video Player with Overlay Component
 *
 * Displays recorded video with synchronized fixation and saccade overlays
 * Supports all three algorithms (I2MC, I-VT, I-DT) with different colors
 * Uses Video.js for professional playback controls
 */

import React, { useEffect, useMemo, RefObject, useState, useRef } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import type { AnalysisResults } from '../types/analysis';
import type { Fixation, Saccade } from 'kollar-ts';
import type Player from 'video.js/dist/types/player';

interface VideoPlayerWithOverlayProps {
  videoUrl: string;
  analysisResults: AnalysisResults;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  showI2MC: boolean;
  showIVT: boolean;
  showIDT: boolean;
  showSaccades: boolean;
  videoRef: RefObject<HTMLVideoElement>;
}

/**
 * Calculate the actual rendered video rectangle accounting for aspect ratio
 * Returns the video's display dimensions and offset within its container
 */
function calculateVideoDisplayRect(
  videoElement: HTMLVideoElement,
  player?: Player | null
): { width: number; height: number; offsetX: number; offsetY: number } {
  const videoWidth = videoElement.videoWidth; // Natural video width
  const videoHeight = videoElement.videoHeight; // Natural video height

  // If we have a Video.js player, try to get the tech element (actual video rendering layer)
  let containerWidth: number;
  let containerHeight: number;

  if (player && player.el()) {
    try {
      // Access the Video.js tech layer (the actual video element being rendered)
      const tech = (player as any).tech({ IWillNotUseThisInPlugins: true });
      const techEl = tech?.el();

      if (techEl && techEl.clientWidth > 0 && techEl.clientHeight > 0) {
        // Use tech element dimensions for pixel-perfect alignment
        containerWidth = techEl.clientWidth;
        containerHeight = techEl.clientHeight;
        console.log('📐 Using Video.js tech element:', { containerWidth, containerHeight });
      } else {
        // Fallback to player element
        const playerEl = player.el();
        containerWidth = playerEl.clientWidth;
        containerHeight = playerEl.clientHeight;
        console.log('📐 Using Video.js player element:', { containerWidth, containerHeight });
      }
    } catch (e) {
      // Fallback if tech access fails
      const playerEl = player.el();
      containerWidth = playerEl.clientWidth;
      containerHeight = playerEl.clientHeight;
      console.log('📐 Tech access failed, using player element:', { containerWidth, containerHeight });
    }
  } else {
    containerWidth = videoElement.clientWidth; // Container width
    containerHeight = videoElement.clientHeight; // Container height
  }

  if (videoWidth === 0 || videoHeight === 0 || containerWidth === 0 || containerHeight === 0) {
    return { width: 0, height: 0, offsetX: 0, offsetY: 0 };
  }

  const videoAspect = videoWidth / videoHeight;
  const containerAspect = containerWidth / containerHeight;

  let displayWidth: number;
  let displayHeight: number;
  let offsetX: number;
  let offsetY: number;

  if (videoAspect > containerAspect) {
    // Video is wider - fit to width, letterbox top/bottom
    displayWidth = containerWidth;
    displayHeight = containerWidth / videoAspect;
    offsetX = 0;
    offsetY = (containerHeight - displayHeight) / 2;
  } else {
    // Video is taller - fit to height, pillarbox left/right
    displayWidth = containerHeight * videoAspect;
    displayHeight = containerHeight;
    offsetX = (containerWidth - displayWidth) / 2;
    offsetY = 0;
  }

  return { width: displayWidth, height: displayHeight, offsetX, offsetY };
}

export default function VideoPlayerWithOverlay({
  videoUrl,
  analysisResults,
  currentTime,
  onTimeUpdate,
  showI2MC,
  showIVT,
  showIDT,
  showSaccades,
  videoRef,
}: VideoPlayerWithOverlayProps) {
  // Track video dimensions and display rect for coordinate scaling
  const [videoDimensions, setVideoDimensions] = useState({ width: 0, height: 0 });
  const [videoDisplayRect, setVideoDisplayRect] = useState({
    width: 0,
    height: 0,
    offsetX: 0,
    offsetY: 0
  });

  // Video.js player instance
  const playerRef = useRef<Player | null>(null);

  // Find active fixations at current time (in milliseconds)
  const activeFixations = useMemo(() => {
    const timeMs = currentTime * 1000;

    return {
      i2mc: analysisResults.i2mc.fixations.find(
        (f) => timeMs >= f.onset && timeMs <= f.offset
      ),
      ivt: analysisResults.ivt.fixations.find(
        (f) => timeMs >= f.onset && timeMs <= f.offset
      ),
      idt: analysisResults.idt.fixations.find(
        (f) => timeMs >= f.onset && timeMs <= f.offset
      ),
    };
  }, [currentTime, analysisResults]);

  // Find active saccade at current time
  const activeSaccade = useMemo(() => {
    if (!analysisResults.ivt.saccades) return null;

    const timeMs = currentTime * 1000;
    return analysisResults.ivt.saccades.find(
      (s) => timeMs >= s.onset && timeMs <= s.offset
    );
  }, [currentTime, analysisResults.ivt.saccades]);

  // Initialize Video.js player
  useEffect(() => {
    // Prevent double initialization (React strict mode)
    if (!videoRef.current) {
      return;
    }

    // Wait for next tick to ensure DOM is ready
    const initTimeout = setTimeout(() => {
      if (!videoRef.current || playerRef.current) {
        return;
      }

      // Initialize Video.js
      const player = videojs(videoRef.current, {
        controls: true,
        fluid: true, // Use fluid mode for responsive sizing
        // No fixed aspectRatio - let video use its natural aspect ratio
        preload: 'auto',
        sources: [{
          src: videoUrl,
          type: 'video/webm'
        }]
      });

      playerRef.current = player;

      console.log('🎬 Video.js player initialized');

      // Wait for video to load metadata
      player.on('loadedmetadata', () => {
        console.log('🎬 Video metadata loaded, dimensions:', {
          videoWidth: player.videoWidth(),
          videoHeight: player.videoHeight()
        });
      });
    }, 0);

    // Cleanup on unmount
    return () => {
      clearTimeout(initTimeout);
      if (playerRef.current) {
        console.log('🎬 Disposing Video.js player');
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl]);

  // RequestAnimationFrame loop for smooth 60 FPS overlay updates
  useEffect(() => {
    let animationFrameId: number;
    let lastUpdateTime = -1;

    const updateLoop = () => {
      if (playerRef.current) {
        const currentTime = playerRef.current.currentTime() || 0;

        // Only update if time has changed by more than 10ms (prevents excessive re-renders)
        if (Math.abs(currentTime - lastUpdateTime) > 0.01) {
          onTimeUpdate(currentTime);
          lastUpdateTime = currentTime;
        }
      }

      // Continue loop
      animationFrameId = requestAnimationFrame(updateLoop);
    };

    // Start the loop
    animationFrameId = requestAnimationFrame(updateLoop);

    console.log('🎞️ RAF rendering loop started');

    // Cleanup
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        console.log('🎞️ RAF rendering loop stopped');
      }
    };
  }, [onTimeUpdate]);

  // Update video dimensions and display rect when video is loaded or resized
  useEffect(() => {
    const updateDimensions = () => {
      if (videoRef.current && playerRef.current) {
        const dims = {
          width: videoRef.current.videoWidth,
          height: videoRef.current.videoHeight,
        };
        const displayRect = calculateVideoDisplayRect(videoRef.current, playerRef.current);

        const playerEl = playerRef.current.el();
        console.log('📹 Video dimensions updated:', dims);
        console.log('📹 Video display rect:', displayRect);
        console.log('📹 Player element size:', {
          clientWidth: playerEl?.clientWidth,
          clientHeight: playerEl?.clientHeight,
        });
        console.log('📹 Video element size:', {
          clientWidth: videoRef.current.clientWidth,
          clientHeight: videoRef.current.clientHeight,
        });

        setVideoDimensions(dims);
        setVideoDisplayRect(displayRect);
      }
    };

    // Listen to player events instead of direct video element
    if (playerRef.current) {
      playerRef.current.on('loadedmetadata', updateDimensions);
      playerRef.current.on('playerresize', updateDimensions);
      window.addEventListener('resize', updateDimensions);

      // Delay initial update to ensure player is fully rendered
      setTimeout(updateDimensions, 100);
    }

    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.off('loadedmetadata', updateDimensions);
          playerRef.current.off('playerresize', updateDimensions);
        } catch (e) {
          // Player might be disposed
        }
      }
      window.removeEventListener('resize', updateDimensions);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate fixation circle size based on duration
  const getFixationSize = (fixation: Fixation) => {
    // Size range: 40px to 100px based on duration (100ms to 1000ms)
    const minSize = 40;
    const maxSize = 100;
    const minDuration = 100;
    const maxDuration = 1000;

    const size = minSize + ((fixation.duration - minDuration) / (maxDuration - minDuration)) * (maxSize - minSize);
    return Math.max(minSize, Math.min(maxSize, size));
  };

  // Calculate scale factors for fixation coordinates
  // Gaze coordinates are in recorded screen space (metadata.screenWidth × screenHeight)
  // Need to scale to video's actual display space (accounting for aspect ratio)
  const recordedScreenWidth = analysisResults.metadata.screenWidth;
  const recordedScreenHeight = analysisResults.metadata.screenHeight;

  // Scale from recorded screen to video's actual rendered size
  const scaleX = videoDisplayRect.width > 0 && recordedScreenWidth > 0
    ? videoDisplayRect.width / recordedScreenWidth
    : 1;
  const scaleY = videoDisplayRect.height > 0 && recordedScreenHeight > 0
    ? videoDisplayRect.height / recordedScreenHeight
    : 1;

  // DEBUG: Log rendering state every second
  useEffect(() => {
    const interval = setInterval(() => {
      console.log('🎯 DEBUG STATE:', {
        currentTime: currentTime.toFixed(2),
        videoDimensions,
        videoDisplayRect: {
          width: videoDisplayRect.width.toFixed(1),
          height: videoDisplayRect.height.toFixed(1),
          offsetX: videoDisplayRect.offsetX.toFixed(1),
          offsetY: videoDisplayRect.offsetY.toFixed(1),
        },
        recordedScreen: { width: recordedScreenWidth, height: recordedScreenHeight },
        scaleFactors: { scaleX: scaleX.toFixed(3), scaleY: scaleY.toFixed(3) },
        activeFixations: {
          i2mc: activeFixations.i2mc ? `(${activeFixations.i2mc.x.toFixed(0)}, ${activeFixations.i2mc.y.toFixed(0)})` : 'none',
          ivt: activeFixations.ivt ? `(${activeFixations.ivt.x.toFixed(0)}, ${activeFixations.ivt.y.toFixed(0)})` : 'none',
          idt: activeFixations.idt ? `(${activeFixations.idt.x.toFixed(0)}, ${activeFixations.idt.y.toFixed(0)})` : 'none',
        },
        activeSaccade: activeSaccade ? 'yes' : 'no',
        totalFixations: {
          i2mc: analysisResults.i2mc.fixations.length,
          ivt: analysisResults.ivt.fixations.length,
          idt: analysisResults.idt.fixations.length,
        },
      });

      // Log first fixation from each algorithm for reference
      if (analysisResults.i2mc.fixations[0]) {
        console.log('📍 Sample I2MC fixation:', analysisResults.i2mc.fixations[0]);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [currentTime, videoDimensions, videoDisplayRect, recordedScreenWidth, recordedScreenHeight, scaleX, scaleY, activeFixations, activeSaccade, analysisResults]);

  // Show error if video URL is invalid
  if (!videoUrl) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-black">
        <div className="text-white text-center p-8">
          <p className="text-xl mb-2">⚠️ Video Loading Failed</p>
          <p className="text-sm text-gray-400">The video blob is invalid or empty.</p>
          <p className="text-sm text-gray-400 mt-2">Please try recording again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-black">
      {/* Video.js Player */}
      <div
        data-vjs-player
        style={{
          width: '100%',
          height: '100%',
          maxWidth: '100%',
          maxHeight: '100%'
        }}
      >
        <video
          ref={videoRef}
          className="video-js vjs-default-skin vjs-big-play-centered"
        />
      </div>

      {/* Fixation Overlays - positioned to match video's actual rendered area */}
      {videoRef.current && videoDisplayRect.width > 0 && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: videoDisplayRect.width,
            height: videoDisplayRect.height,
          }}
        >

          {/* I2MC Fixation (Green) */}
          {showI2MC && activeFixations.i2mc && (
            <FixationCircle
              fixation={activeFixations.i2mc}
              color="green"
              size={getFixationSize(activeFixations.i2mc)}
              scaleX={scaleX}
              scaleY={scaleY}
            />
          )}

          {/* I-VT Fixation (Blue) */}
          {showIVT && activeFixations.ivt && (
            <FixationCircle
              fixation={activeFixations.ivt}
              color="blue"
              size={getFixationSize(activeFixations.ivt)}
              scaleX={scaleX}
              scaleY={scaleY}
            />
          )}

          {/* I-DT Fixation (Yellow) */}
          {showIDT && activeFixations.idt && (
            <FixationCircle
              fixation={activeFixations.idt}
              color="yellow"
              size={getFixationSize(activeFixations.idt)}
              scaleX={scaleX}
              scaleY={scaleY}
            />
          )}

          {/* Saccade Arrow (Purple) */}
          {showSaccades && activeSaccade && (
            <SaccadeArrow
              saccade={activeSaccade}
              scaleX={scaleX}
              scaleY={scaleY}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Fixation Circle Component
 */
interface FixationCircleProps {
  fixation: Fixation;
  color: 'green' | 'blue' | 'yellow';
  size: number;
  scaleX: number;
  scaleY: number;
}

function FixationCircle({ fixation, color, size, scaleX, scaleY }: FixationCircleProps) {
  // Validate fixation data
  if (!fixation || typeof fixation.x !== 'number' || typeof fixation.y !== 'number') {
    console.warn('Invalid fixation data:', fixation);
    return null;
  }

  // Validate scale factors
  if (!isFinite(scaleX) || !isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    console.warn('Invalid scale factors:', { scaleX, scaleY });
    return null;
  }

  const colorClasses = {
    green: 'border-green-500 bg-green-500',
    blue: 'border-blue-500 bg-blue-500',
    yellow: 'border-yellow-500 bg-yellow-500',
  };

  const colorClass = colorClasses[color];

  // Scale fixation coordinates to match video display size
  const scaledX = fixation.x * scaleX;
  const scaledY = fixation.y * scaleY;

  // Validate scaled coordinates
  if (!isFinite(scaledX) || !isFinite(scaledY)) {
    console.warn('Invalid scaled coordinates:', { scaledX, scaledY, fixation, scaleX, scaleY });
    return null;
  }

  return (
    <div
      className="absolute"
      style={{
        left: scaledX,
        top: scaledY,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Outer circle */}
      <div
        className={`absolute rounded-full border-4 ${colorClass} bg-opacity-10 animate-pulse`}
        style={{
          width: size,
          height: size,
          left: -size / 2,
          top: -size / 2,
        }}
      />

      {/* Center dot */}
      <div className={`absolute w-2 h-2 ${colorClass.replace('border-', 'bg-')} rounded-full -left-1 -top-1`} />

      {/* Duration label */}
      <div
        className={`absolute left-${size / 2 + 8} top-0 ${colorClass.replace('border-', 'bg-').replace('bg-opacity-10', '')} text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap`}
        style={{ left: size / 2 + 8 }}
      >
        {fixation.duration.toFixed(0)}ms
      </div>
    </div>
  );
}

/**
 * Saccade Arrow Component
 */
interface SaccadeArrowProps {
  saccade: Saccade;
  scaleX: number;
  scaleY: number;
}

function SaccadeArrow({ saccade, scaleX, scaleY }: SaccadeArrowProps) {
  // Validate saccade data
  if (!saccade ||
      typeof saccade.xOnset !== 'number' ||
      typeof saccade.yOnset !== 'number' ||
      typeof saccade.xOffset !== 'number' ||
      typeof saccade.yOffset !== 'number') {
    console.warn('Invalid saccade data:', saccade);
    return null;
  }

  // Validate scale factors
  if (!isFinite(scaleX) || !isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    console.warn('Invalid scale factors for saccade:', { scaleX, scaleY });
    return null;
  }

  // Scale saccade coordinates
  const scaledXOnset = saccade.xOnset * scaleX;
  const scaledYOnset = saccade.yOnset * scaleY;
  const scaledXOffset = saccade.xOffset * scaleX;
  const scaledYOffset = saccade.yOffset * scaleY;

  // Validate scaled coordinates
  if (!isFinite(scaledXOnset) || !isFinite(scaledYOnset) ||
      !isFinite(scaledXOffset) || !isFinite(scaledYOffset)) {
    console.warn('Invalid scaled saccade coordinates');
    return null;
  }

  // Calculate arrow angle and length with scaled coordinates
  const dx = scaledXOffset - scaledXOnset;
  const dy = scaledYOffset - scaledYOnset;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const length = Math.sqrt(dx * dx + dy * dy);

  // Skip rendering very short saccades (less than 5 pixels)
  if (length < 5) {
    return null;
  }

  return (
    <div
      className="absolute"
      style={{
        left: scaledXOnset,
        top: scaledYOnset,
        transform: `rotate(${angle}deg)`,
        transformOrigin: 'left center',
      }}
    >
      {/* Arrow line */}
      <div
        className="h-1 bg-purple-500 opacity-75"
        style={{ width: length }}
      />

      {/* Arrowhead */}
      <div
        className="absolute right-0 top-1/2 -translate-y-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: '12px solid rgb(168, 85, 247)',
          borderTop: '6px solid transparent',
          borderBottom: '6px solid transparent',
        }}
      />

      {/* Info label */}
      <div
        className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-purple-500 text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap"
      >
        {saccade.duration.toFixed(0)}ms | {saccade.amplitude.toFixed(1)}°
      </div>
    </div>
  );
}
