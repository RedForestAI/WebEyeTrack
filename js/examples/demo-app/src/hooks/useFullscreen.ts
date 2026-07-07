/**
 * Fullscreen mode hook
 *
 * Manages fullscreen state and provides accurate screen dimensions
 * when in fullscreen mode for precise gaze calibration
 */

import { useState, useEffect, useCallback } from 'react';

interface FullscreenState {
  isFullscreen: boolean;
  isSupported: boolean;
  screenWidth: number;
  screenHeight: number;
}

export function useFullscreen() {
  const [state, setState] = useState<FullscreenState>({
    isFullscreen: false,
    isSupported: document.fullscreenEnabled,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
  });

  // Update state when fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = document.fullscreenElement !== null;

      setState(prev => ({
        ...prev,
        isFullscreen,
        // Update dimensions when entering fullscreen
        screenWidth: isFullscreen ? window.screen.width : window.innerWidth,
        screenHeight: isFullscreen ? window.screen.height : window.innerHeight,
      }));
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  // Request fullscreen
  const enterFullscreen = useCallback(async () => {
    if (!state.isSupported) {
      console.warn('Fullscreen API not supported');
      return false;
    }

    try {
      await document.documentElement.requestFullscreen();
      return true;
    } catch (error) {
      console.error('Failed to enter fullscreen:', error);
      return false;
    }
  }, [state.isSupported]);

  // Exit fullscreen
  const exitFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      return;
    }

    try {
      await document.exitFullscreen();
    } catch (error) {
      console.error('Failed to exit fullscreen:', error);
    }
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(async () => {
    if (state.isFullscreen) {
      await exitFullscreen();
    } else {
      await enterFullscreen();
    }
  }, [state.isFullscreen, enterFullscreen, exitFullscreen]);

  return {
    ...state,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
  };
}
