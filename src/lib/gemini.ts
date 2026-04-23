import { GoogleGenAI, Type } from '@google/genai';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

const getApiKey = () => {
  // @ts-ignore
  return process.env.API_KEY || process.env.GEMINI_API_KEY;
};

export const checkAndSelectApiKey = async () => {
  if (window.aistudio && window.aistudio.hasSelectedApiKey) {
    const hasKey = await window.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await window.aistudio.openSelectKey();
    }
  }
};

export const generateVideo = async (
  prompt: string,
  imageBase64?: string,
  aspectRatio: '16:9' | '9:16' = '16:9',
  onProgress?: (msg: string) => void
) => {
  await checkAndSelectApiKey();
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  onProgress?.('Initializing generation...');

  const req: any = {
    model: 'veo-3.1-fast-generate-preview',
    prompt,
    config: {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio,
    }
  };

  if (imageBase64) {
    req.image = {
      imageBytes: imageBase64.split(',')[1],
      mimeType: imageBase64.split(';')[0].split(':')[1],
    };
  }

  try {
    let operation = await ai.models.generateVideos(req);

    onProgress?.('Generating video... This may take a few minutes.');

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({operation: operation});
      onProgress?.('Still generating... Please wait.');
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error('No video generated');

    onProgress?.('Downloading video...');

    const response = await fetch(downloadLink, {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey,
      },
    });

    const blob = await response.blob();
    return {
      url: URL.createObjectURL(blob),
      videoObj: operation.response?.generatedVideos?.[0]?.video
    };
  } catch (e: any) {
    if (e.message?.includes('Requested entity was not found')) {
      await window.aistudio?.openSelectKey();
      throw new Error('API Key was not found or invalid. Please select a valid key and try again.');
    }
    throw e;
  }
};

export const extendVideo = async (
  prompt: string,
  previousVideo: any,
  aspectRatio: '16:9' | '9:16',
  onProgress?: (msg: string) => void
) => {
  await checkAndSelectApiKey();
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  onProgress?.('Initializing extension...');

  try {
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-generate-preview',
      prompt,
      video: previousVideo,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio,
      }
    });

    onProgress?.('Extending video... This may take a few minutes.');

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({operation: operation});
      onProgress?.('Still extending... Please wait.');
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error('No video generated');

    onProgress?.('Downloading extended video...');

    const response = await fetch(downloadLink, {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey,
      },
    });

    const blob = await response.blob();
    return {
      url: URL.createObjectURL(blob),
      videoObj: operation.response?.generatedVideos?.[0]?.video
    };
  } catch (e: any) {
    if (e.message?.includes('Requested entity was not found')) {
      await window.aistudio?.openSelectKey();
      throw new Error('API Key was not found or invalid. Please select a valid key and try again.');
    }
    throw e;
  }
};

export const analyzeVideoFrames = async (
  framesBase64: string[],
  onProgress?: (msg: string) => void
) => {
  await checkAndSelectApiKey();
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  onProgress?.('Analyzing frames with Gemini...');

  const parts: any[] = framesBase64.map((frame) => ({
    inlineData: {
      data: frame.split(',')[1],
      mimeType: 'image/jpeg'
    }
  }));

  parts.unshift({
    text: "These are sequential frames from a video, extracted evenly. Analyze them to find the most exciting, viral-worthy moments, especially PvP (player vs player) combat, funny moments, or high-action sequences suitable for short-form content (TikTok/Reels). Identify 1 to 4 clips. Return a JSON array."
  });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Catchy title for the clip" },
            start_time: { type: Type.NUMBER, description: "Start time in seconds" },
            end_time: { type: Type.NUMBER, description: "End time in seconds" },
            reason: { type: Type.STRING, description: "Why this is a good viral clip" }
          },
          required: ["title", "start_time", "end_time", "reason"]
        }
      }
    }
  });

  return JSON.parse(response.text || '[]');
};
