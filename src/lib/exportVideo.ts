export type ExportFormat = 'webm' | 'mp4';
export type ExportQuality = 'high' | 'medium' | 'low';

export const isFormatSupported = (format: ExportFormat) => {
  if (format === 'mp4') {
    return MediaRecorder.isTypeSupported('video/mp4') || MediaRecorder.isTypeSupported('video/mp4;codecs=avc1');
  }
  return MediaRecorder.isTypeSupported('video/webm;codecs=vp9') || MediaRecorder.isTypeSupported('video/webm');
};

export const exportVideoClip = async (
  videoUrl: string,
  startTime: number,
  endTime: number,
  options: {
    format: ExportFormat;
    quality: ExportQuality;
  },
  onProgress?: (progress: number) => void
): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous'; // Generally safe, blob URLs don't need it but good practice
      video.src = videoUrl;
      video.muted = false; 
      video.playsInline = true;

      video.addEventListener('loadedmetadata', () => {
        let width = video.videoWidth;
        let height = video.videoHeight;
        
        if (width === 0 || height === 0) {
          return reject(new Error("Video dimensions are 0."));
        }

        const aspect = width / height;

        if (options.quality === 'low') {
          height = Math.min(height, 480);
          width = Math.round(height * aspect);
        } else if (options.quality === 'medium') {
          height = Math.min(height, 720);
          width = Math.round(height * aspect);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error("Could not get canvas context"));

        // Web Audio API to capture audio silently
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const sourceNode = audioCtx.createMediaElementSource(video);
        const destNode = audioCtx.createMediaStreamDestination();
        sourceNode.connect(destNode);
        // Deliberately not connecting to audioCtx.destination to keep it purely background

        const canvasStream = canvas.captureStream(30);
        const audioTracks = destNode.stream.getAudioTracks();
        
        const combinedTracks = [...canvasStream.getVideoTracks()];
        if (audioTracks.length > 0) {
          combinedTracks.push(...audioTracks);
        }
        
        const combinedStream = new MediaStream(combinedTracks);

        let mimeType = options.format === 'mp4' ? 'video/mp4' : 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
             mimeType = options.format === 'mp4' ? 'video/mp4' : 'video/webm'; // fallback attempt
             if (!MediaRecorder.isTypeSupported(mimeType)) {
                 mimeType = ''; // Let browser decide
             }
        }

        const bps = options.quality === 'high' ? 8000000 : options.quality === 'medium' ? 4000000 : 1500000;

        const recorder = new MediaRecorder(combinedStream, {
          mimeType: mimeType || undefined,
          videoBitsPerSecond: bps,
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = e => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          audioCtx.close();
          const finalMime = mimeType || (options.format === 'mp4' ? 'video/mp4' : 'video/webm');
          const blob = new Blob(chunks, { type: finalMime });
          const url = URL.createObjectURL(blob);
          resolve(url);
        };

        let isRecording = false;

        const startRecord = async () => {
          if (isRecording) return;
          isRecording = true;
          
          await audioCtx.resume();
          recorder.start();
          try {
            await video.play();
          } catch (err) {
            recorder.stop();
            return reject(err);
          }

          const duration = endTime - startTime;
          
          const drawFrame = () => {
            if (video.currentTime >= endTime || video.ended) {
              video.pause();
              if (recorder.state === 'recording') {
                recorder.stop();
              }
              return;
            }
            if (!video.paused && !video.ended) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              if (onProgress) {
                 const progress = Math.min(100, Math.max(0, ((video.currentTime - startTime) / duration) * 100));
                 onProgress(progress);
              }
            }
            requestAnimationFrame(drawFrame);
          };
          
          drawFrame();
        };

        video.onseeked = startRecord;
        if (video.currentTime === startTime) {
           // Small timeout to allow buffer preparation
           setTimeout(startRecord, 50);
        } else {
           video.currentTime = startTime;
        }
      });

      video.onerror = () => reject(new Error("Failed to load video for export"));
      video.load();

    } catch (e) {
      reject(e);
    }
  });
};
