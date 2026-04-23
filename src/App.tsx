/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { generateVideo, extendVideo, checkAndSelectApiKey, analyzeVideoFrames } from './lib/gemini';
import { Film, Image as ImageIcon, Wand2, Play, Pause, Plus, Loader2, Key, X, AlertCircle, Scissors, Upload, Sparkles, Video } from 'lucide-react';

const extractFrames = async (file: File): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;
    
    video.onloadedmetadata = async () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 480;
        canvas.height = (video.videoHeight / video.videoWidth) * 480;
        
        const frames: string[] = [];
        const duration = video.duration;
        const interval = Math.max(1, duration / 30); // Max 30 frames
        
        for (let t = 0; t < duration; t += interval) {
          if (t >= duration) break;
          video.currentTime = t;
          await new Promise(r => { video.onseeked = r; });
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL('image/jpeg', 0.5));
        }
        resolve(frames);
      } catch (e) {
        reject(e);
      }
    };
    video.onerror = reject;
  });
};

export default function App() {
  const [appMode, setAppMode] = useState<'generate' | 'auto-edit'>('generate');

  // Generate State
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoObj, setVideoObj] = useState<any>(null);
  const [duration, setDuration] = useState(0);

  // Auto-Edit State
  const [uploadedVideoFile, setUploadedVideoFile] = useState<File | null>(null);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [uploadedVideoDuration, setUploadedVideoDuration] = useState(0);
  const [clips, setClips] = useState<any[]>([]);
  const [activeClip, setActiveClip] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Shared State
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await generateVideo(prompt, image || undefined, aspectRatio, setProgressMsg);
      setVideoUrl(res.url);
      setVideoObj(res.videoObj);
      setDuration(5); // base duration is roughly 5s
      setIsPlaying(true);
      if (videoRef.current) videoRef.current.play();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to generate video');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExtend = async () => {
    if (!prompt || !videoObj) return;
    setIsGenerating(true);
    setError(null);
    try {
      const res = await extendVideo(prompt, videoObj, aspectRatio, setProgressMsg);
      setVideoUrl(res.url);
      setVideoObj(res.videoObj);
      setDuration(d => d + 7); // extending adds 7s
      setIsPlaying(true);
      if (videoRef.current) videoRef.current.play();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to extend video');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedVideoFile(file);
      setUploadedVideoUrl(URL.createObjectURL(file));
      setClips([]);
      setActiveClip(null);
      setIsPlaying(false);
    }
  };

  const handleAnalyze = async () => {
    if (!uploadedVideoFile) return;
    setIsGenerating(true);
    setError(null);
    try {
      setProgressMsg('Extracting frames from video...');
      const frames = await extractFrames(uploadedVideoFile);
      
      setProgressMsg('Analyzing gameplay for viral moments...');
      const generatedClips = await analyzeVideoFrames(frames, setProgressMsg);
      
      setClips(generatedClips);
      if (generatedClips.length > 0) {
        setActiveClip(0);
        if (videoRef.current) {
          videoRef.current.currentTime = generatedClips[0].start_time;
          videoRef.current.play();
          setIsPlaying(true);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to analyze video');
    } finally {
      setIsGenerating(false);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    
    const current = videoRef.current.currentTime;
    setCurrentTime(current);

    if (appMode === 'auto-edit' && activeClip !== null && clips[activeClip]) {
      const clip = clips[activeClip];
      if (current >= clip.end_time) {
        videoRef.current.currentTime = clip.start_time;
        videoRef.current.play();
      }
    }
  };

  const currentVideoSrc = appMode === 'generate' ? videoUrl : uploadedVideoUrl;

  return (
    <div className="h-screen w-full bg-[#09090b] text-zinc-300 flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-zinc-800 flex items-center px-6 justify-between bg-[#09090b]">
        <div className="flex items-center gap-3 text-zinc-100 font-medium">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
            <Film className="w-4 h-4 text-indigo-400" />
          </div>
          <span className="tracking-tight">Veo Studio</span>
        </div>
        <button onClick={checkAndSelectApiKey} className="text-xs font-medium flex items-center gap-2 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 px-3 py-1.5 rounded-md transition-colors cursor-pointer">
          <Key className="w-3.5 h-3.5 text-zinc-400" />
          API Key
        </button>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-80 border-r border-zinc-800 bg-[#0c0c0e] p-5 flex flex-col gap-6 overflow-y-auto">
          
          {/* Mode Switcher */}
          <div className="flex bg-zinc-900 p-1 rounded-lg shrink-0">
            <button 
              onClick={() => setAppMode('generate')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer ${appMode === 'generate' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Wand2 className="w-3.5 h-3.5" /> Generate
            </button>
            <button 
              onClick={() => setAppMode('auto-edit')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer ${appMode === 'auto-edit' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Scissors className="w-3.5 h-3.5" /> Auto-Edit
            </button>
          </div>

          {appMode === 'generate' ? (
            <div className="space-y-4 flex-1 flex flex-col">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Generation Settings</h2>

              {/* Prompt */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the video you want to generate..."
                  className="w-full h-32 bg-zinc-900 border border-zinc-800 rounded-md p-3 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 resize-none placeholder:text-zinc-600"
                />
              </div>

              {/* Image Upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Starting Frame (Optional)</label>
                {!image ? (
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-zinc-800 border-dashed rounded-md cursor-pointer hover:bg-zinc-900/50 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <ImageIcon className="w-6 h-6 text-zinc-500 mb-2" />
                      <p className="text-xs text-zinc-500">Click to upload image</p>
                    </div>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                ) : (
                  <div className="relative w-full aspect-video bg-zinc-900 rounded-md overflow-hidden border border-zinc-800 group">
                    <img src={image} alt="Starting frame" className="w-full h-full object-cover" />
                    <button onClick={() => setImage(null)} className="absolute top-2 right-2 bg-black/60 p-1.5 rounded-full hover:bg-black opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Aspect Ratio */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Aspect Ratio</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAspectRatio('16:9')}
                    className={`flex-1 py-2 text-xs font-medium rounded-md border cursor-pointer ${aspectRatio === '16:9' ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}
                  >
                    16:9 Landscape
                  </button>
                  <button
                    onClick={() => setAspectRatio('9:16')}
                    className={`flex-1 py-2 text-xs font-medium rounded-md border cursor-pointer ${aspectRatio === '9:16' ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800'}`}
                  >
                    9:16 Portrait
                  </button>
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-zinc-800">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !prompt}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {isGenerating ? 'Generating...' : 'Generate Video'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 flex-1 flex flex-col">
              <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Auto-Editor</h2>
              
              <div className="space-y-2 shrink-0">
                <label className="text-sm font-medium text-zinc-300">Upload Source Video</label>
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-zinc-800 border-dashed rounded-md cursor-pointer hover:bg-zinc-900/50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-6 h-6 text-zinc-500 mb-2" />
                    <p className="text-xs text-zinc-500 font-medium">Click to upload gameplay</p>
                    <p className="text-[10px] text-zinc-600 mt-1">MP4, WebM, MOV</p>
                  </div>
                  <input type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                </label>
              </div>

              {uploadedVideoFile && (
                <button
                  onClick={handleAnalyze}
                  disabled={isGenerating}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
                >
                  {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {isGenerating ? 'Analyzing...' : 'Find Viral Clips'}
                </button>
              )}

              {clips.length > 0 && (
                <div className="space-y-3 mt-4 flex-1 overflow-y-auto pr-1">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider sticky top-0 bg-[#0c0c0e] py-1">Generated Clips</h3>
                  <div className="flex flex-col gap-2">
                    {clips.map((clip, idx) => (
                      <div 
                        key={idx}
                        onClick={() => {
                          setActiveClip(idx);
                          if (videoRef.current) {
                            videoRef.current.currentTime = clip.start_time;
                            videoRef.current.play();
                            setIsPlaying(true);
                          }
                        }}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${activeClip === idx ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-zinc-900/50 border-zinc-800 hover:bg-zinc-800'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className={`text-sm font-medium ${activeClip === idx ? 'text-indigo-300' : 'text-zinc-300'}`}>{clip.title}</h4>
                          <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded shrink-0">
                            {Math.round(clip.end_time - clip.start_time)}s
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2">{clip.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* Center Workspace */}
        <main className="flex-1 flex flex-col relative bg-[#050505]">
          {/* Error Toast */}
          {error && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg flex items-start gap-3 max-w-md z-50 shadow-2xl backdrop-blur-md">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
              <div className="flex-1 text-sm leading-relaxed">{error}</div>
              <button onClick={() => setError(null)} className="text-red-400/70 hover:text-red-400 mt-0.5 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Video Player Area */}
          <div className="flex-1 p-8 flex items-center justify-center">
            <div className={`relative w-full max-w-4xl ${appMode === 'generate' ? (aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16] max-h-[80vh] w-auto') : 'aspect-video'} bg-zinc-900/50 rounded-xl overflow-hidden border border-zinc-800/80 shadow-2xl flex items-center justify-center`}>
              {currentVideoSrc && !isGenerating && (
                <video
                  ref={videoRef}
                  src={currentVideoSrc}
                  className="w-full h-full object-contain"
                  onEnded={() => setIsPlaying(false)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onTimeUpdate={handleTimeUpdate}
                  onLoadedMetadata={(e) => {
                    if (appMode === 'auto-edit') {
                      setUploadedVideoDuration(e.currentTarget.duration);
                    }
                  }}
                  controls={false}
                  loop={appMode === 'generate'}
                />
              )}

              {!currentVideoSrc && !isGenerating && (
                <div className="text-zinc-600 flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-full border border-zinc-800 border-dashed flex items-center justify-center bg-zinc-900/30">
                    {appMode === 'generate' ? <Film className="w-8 h-8 opacity-40" /> : <Video className="w-8 h-8 opacity-40" />}
                  </div>
                  <p className="text-sm font-medium">{appMode === 'generate' ? 'Ready to create' : 'Upload a video to start'}</p>
                </div>
              )}

              {isGenerating && (
                <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-md flex flex-col items-center justify-center z-10">
                  <div className="relative">
                    <div className="w-16 h-16 border-4 border-zinc-800 rounded-full"></div>
                    <div className="w-16 h-16 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin absolute inset-0"></div>
                  </div>
                  <p className="text-zinc-300 font-medium mt-6 animate-pulse">{progressMsg}</p>
                </div>
              )}

              {currentVideoSrc && !isGenerating && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-zinc-950/80 backdrop-blur-xl px-2 py-2 rounded-full border border-zinc-800/80 shadow-xl">
                  <button onClick={togglePlay} className="w-10 h-10 flex items-center justify-center rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 transition-colors cursor-pointer">
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Timeline / Action Bar */}
          <div className="h-48 border-t border-zinc-800 bg-[#09090b] p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Timeline</h3>
              {appMode === 'generate' && videoUrl && (
                <button
                  onClick={handleExtend}
                  disabled={isGenerating}
                  className="text-xs font-medium flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Extend (+7s)
                </button>
              )}
            </div>

            <div className="flex-1 flex flex-col gap-2">
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono tracking-wider">
                <span>00:00</span>
                <span>
                  {appMode === 'generate' 
                    ? `00:${duration.toString().padStart(2, '0')}` 
                    : `00:${Math.floor(uploadedVideoDuration).toString().padStart(2, '0')}`}
                </span>
              </div>
              <div className="relative flex-1 bg-zinc-900/50 rounded-lg border border-zinc-800/50 overflow-hidden">
                {/* Track */}
                {appMode === 'generate' ? (
                  <div className="absolute top-2 bottom-2 left-2 right-2 bg-zinc-800/50 rounded flex items-center px-4 border border-zinc-700/30 overflow-hidden">
                    {videoUrl ? (
                      <div className="truncate text-xs text-zinc-300 font-medium flex items-center gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                        {prompt}
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-600 font-medium italic">No media in timeline</div>
                    )}
                  </div>
                ) : (
                  <div className="absolute top-2 bottom-2 left-2 right-2 bg-zinc-800/50 rounded flex items-center border border-zinc-700/30 overflow-hidden relative">
                    {clips.map((clip, idx) => {
                      const left = (clip.start_time / uploadedVideoDuration) * 100;
                      const width = ((clip.end_time - clip.start_time) / uploadedVideoDuration) * 100;
                      return (
                        <div 
                          key={idx}
                          onClick={() => {
                            setActiveClip(idx);
                            if (videoRef.current) {
                              videoRef.current.currentTime = clip.start_time;
                              videoRef.current.play();
                              setIsPlaying(true);
                            }
                          }}
                          className={`absolute h-full border-x border-indigo-500/50 cursor-pointer transition-colors ${activeClip === idx ? 'bg-indigo-500/40' : 'bg-indigo-500/20 hover:bg-indigo-500/30'}`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                        >
                          <div className="text-[9px] font-bold text-indigo-200 px-1 truncate mt-1">{clip.title}</div>
                        </div>
                      );
                    })}
                    {/* Playhead */}
                    {uploadedVideoDuration > 0 && (
                      <div 
                        className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
                        style={{ left: `${(currentTime / uploadedVideoDuration) * 100}%` }}
                      />
                    )}
                    {clips.length === 0 && (
                      <div className="absolute inset-0 flex items-center px-4 text-xs text-zinc-600 font-medium italic">
                        Upload and analyze a video to see clips
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
