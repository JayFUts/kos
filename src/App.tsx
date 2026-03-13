import { useState } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { Image as ImageIcon, Link, Loader2, Download, Sparkles, LayoutTemplate, Palette, Type as TypeIcon, CheckCircle2, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function fetchImageAsBase64(imageUrl: string): Promise<{data: string, mimeType: string}> {
  try {
    const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`);
    if (!res.ok) throw new Error('Network response was not ok');
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = (reader.result as string).split(',')[1];
        resolve({ data: base64data, mimeType: blob.type || 'image/jpeg' });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("Primary proxy failed, trying fallback...", e);
    const res = await fetch(`https://corsproxy.io/?${encodeURIComponent(imageUrl)}`);
    const blob = await res.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = (reader.result as string).split(',')[1];
        resolve({ data: base64data, mimeType: blob.type || 'image/jpeg' });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export default function App() {
  const [url, setUrl] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [style, setStyle] = useState('Studio photography, clean light background, professional lighting, highly detailed');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');
  
  const [resultBgImage, setResultBgImage] = useState('');
  const [adData, setAdData] = useState<{headline: string, copy: string, backgroundPrompt: string, originalImageBase64: string} | null>(null);
  
  const [showText, setShowText] = useState(true);
  const [blendMode, setBlendMode] = useState<'multiply' | 'normal'>('multiply');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError('');
    setResultBgImage('');
    setAdData(null);

    try {
      setLoadingStep('Productpagina analyseren & afbeelding zoeken...');
      
      // Stap 1: Analyseer de URL, haal de afbeelding URL en product info op
      const promptResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the product page at ${url}. 
        1. Find the absolute URL of the main product image (the actual product, not a logo). If it's a relative URL, prepend the domain.
        2. Write an image generation prompt for an EMPTY background scene (e.g., an empty podium, an empty table, a blank studio setup) matching this style: ${style}. The scene MUST BE EMPTY, with NO products, NO objects, and NO text. We will overlay the product later.
        3. Write a catchy ad headline using the exact product name.
        4. Write a short, punchy ad copy highlighting the main features, benefits, and price found on the page.`,
        config: {
          tools: [{urlContext: {}}],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              imageUrl: { type: Type.STRING, description: "Absolute URL of the main product image." },
              backgroundPrompt: { type: Type.STRING, description: "Image generation prompt for the EMPTY background." },
              headline: { type: Type.STRING, description: "Catchy ad headline in Dutch." },
              copy: { type: Type.STRING, description: "Short ad copy in Dutch highlighting features/price." }
            },
            required: ["imageUrl", "backgroundPrompt", "headline", "copy"]
          }
        },
      });

      let jsonStr = promptResponse.text?.trim() || '{}';
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/, '').replace(/```$/, '').trim();
      }
      const extractedData = JSON.parse(jsonStr);

      if (!extractedData.imageUrl) {
        throw new Error("Kon geen productafbeelding vinden op deze pagina.");
      }

      setLoadingStep('Originele productafbeelding downloaden...');
      const sourceImage = await fetchImageAsBase64(extractedData.imageUrl);
      const originalImageBase64 = `data:${sourceImage.mimeType};base64,${sourceImage.data}`;

      setLoadingStep('Achtergrond genereren met Nano Banana...');

      // Stap 2: Genereer ALLEEN de lege achtergrond met Nano Banana
      const imageResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { text: extractedData.backgroundPrompt }
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
          },
        },
      });

      let base64BgImage = '';
      const parts = imageResponse.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData) {
          base64BgImage = part.inlineData.data;
          break;
        }
      }

      if (!base64BgImage) throw new Error("Kon de achtergrond niet genereren.");

      setResultBgImage(`data:image/png;base64,${base64BgImage}`);
      setAdData({
        headline: extractedData.headline,
        copy: extractedData.copy,
        backgroundPrompt: extractedData.backgroundPrompt,
        originalImageBase64: originalImageBase64
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Er is een fout opgetreden tijdens het genereren. Mogelijk blokkeert de website toegang.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-emerald-500/30">
      <div className="max-w-7xl mx-auto px-4 py-8 lg:py-12 grid lg:grid-cols-12 gap-8 lg:gap-16">
        
        {/* Linker Kolom: Controls */}
        <div className="lg:col-span-5 space-y-8">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight mb-2 flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-emerald-400" />
              Ad Creator Pro
            </h1>
            <p className="text-zinc-400">
              Downloadt de <strong>exacte productfoto</strong> van de URL en plaatst deze naadloos in een AI-gegenereerde omgeving. 100% accuraat.
            </p>
          </div>

          <form onSubmit={handleGenerate} className="space-y-6 bg-zinc-900/50 p-6 rounded-2xl border border-zinc-800/50">
            {/* URL Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Link className="w-4 h-4" /> Product URL
              </label>
              <input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/product"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
              />
            </div>

            {/* Aspect Ratio */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <LayoutTemplate className="w-4 h-4" /> Beeldverhouding
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: '1:1', label: 'Vierkant', sub: 'Instagram' },
                  { id: '9:16', label: 'Staand', sub: 'Stories/Reels' },
                  { id: '16:9', label: 'Liggend', sub: 'YouTube' }
                ].map((ratio) => (
                  <button
                    key={ratio.id}
                    type="button"
                    onClick={() => setAspectRatio(ratio.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      aspectRatio === ratio.id 
                        ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' 
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <div className="font-medium text-sm">{ratio.id}</div>
                    <div className="text-xs opacity-70 mt-1">{ratio.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Style */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Palette className="w-4 h-4" /> Achtergrond Stijl
              </label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none"
              >
                <option value="Studio photography, clean light background, professional lighting, highly detailed">Studio Fotografie (Licht)</option>
                <option value="Lifestyle photography, natural lighting, empty table, warm and inviting">Lifestyle (Tafel/Interieur)</option>
                <option value="Minimalist, solid pastel color background, modern, sleek, sharp focus">Minimalistisch (Pastel)</option>
                <option value="Vibrant, colorful, energetic, pop-art influence, high contrast">Kleurrijk & Energiek</option>
              </select>
              <p className="text-xs text-zinc-500 mt-1">Lichte achtergronden werken het beste voor producten met een witte achtergrond.</p>
            </div>

            <button
              type="submit"
              disabled={loading || !url}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold py-3.5 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Genereren...
                </>
              ) : (
                <>
                  <ImageIcon className="w-5 h-5" />
                  Maak Ad Creative
                </>
              )}
            </button>
          </form>

          {/* Originele Afbeelding Preview */}
          {adData?.originalImageBase64 && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50 flex items-center gap-4"
            >
              <img src={adData.originalImageBase64} alt="Original" className="w-16 h-16 object-contain rounded-lg bg-white" />
              <div>
                <p className="text-sm font-medium text-zinc-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Product Gedownload
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">Deze exacte foto wordt over de achtergrond geplaatst.</p>
              </div>
            </motion.div>
          )}
        </div>

        {/* Rechter Kolom: Preview */}
        <div className="lg:col-span-7">
          <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-3xl h-full min-h-[600px] flex flex-col items-center justify-center p-4 sm:p-8 relative overflow-hidden">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div 
                  key="loading"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex flex-col items-center text-center max-w-sm"
                >
                  <div className="w-16 h-16 border-4 border-zinc-800 border-t-emerald-500 rounded-full animate-spin mb-6" />
                  <h3 className="text-xl font-medium text-zinc-200 mb-2">Bezig met creëren</h3>
                  <p className="text-zinc-500">{loadingStep}</p>
                </motion.div>
              ) : error ? (
                <motion.div 
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-red-500/10 text-red-400 p-6 rounded-2xl max-w-md text-center border border-red-500/20"
                >
                  <p>{error}</p>
                </motion.div>
              ) : resultBgImage && adData ? (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full h-full flex flex-col items-center justify-center"
                >
                  {/* Controls Toolbar */}
                  <div className="flex flex-wrap items-center gap-3 mb-6 bg-zinc-900/80 p-1.5 rounded-xl border border-zinc-800 w-full max-w-2xl">
                    <div className="flex items-center gap-1 border-r border-zinc-700 pr-3">
                      <button
                        onClick={() => setShowText(true)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${showText ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                      >
                        <TypeIcon className="w-4 h-4" /> Tekst
                      </button>
                      <button
                        onClick={() => setShowText(false)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${!showText ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                      >
                        <ImageIcon className="w-4 h-4" /> Beeld
                      </button>
                    </div>
                    
                    <div className="flex items-center gap-1 pl-1">
                      <Layers className="w-4 h-4 text-zinc-500 mr-1 hidden sm:block" />
                      <button
                        onClick={() => setBlendMode('multiply')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${blendMode === 'multiply' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                        title="Verwijdert een witte achtergrond van het product"
                      >
                        Blend Wit
                      </button>
                      <button
                        onClick={() => setBlendMode('normal')}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${blendMode === 'normal' ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-400 hover:text-zinc-200'}`}
                        title="Gebruik dit als het product al een transparante achtergrond heeft"
                      >
                        Normaal (PNG)
                      </button>
                    </div>
                  </div>

                  {/* Ad Creative Canvas (Compositing) */}
                  <div className={`relative rounded-2xl overflow-hidden shadow-2xl shadow-black/50 bg-zinc-900 ${
                    aspectRatio === '16:9' ? 'w-full aspect-video' : 
                    aspectRatio === '9:16' ? 'h-full aspect-[9/16]' : 
                    'w-full max-w-lg aspect-square'
                  }`}>
                    {/* 1. AI Generated Background */}
                    <img 
                      src={resultBgImage} 
                      alt="Generated Background" 
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    
                    {/* 2. Exact Downloaded Product Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center p-12 sm:p-16 pb-32">
                      <img 
                        src={adData.originalImageBase64} 
                        alt="Original Product" 
                        className={`w-full h-full object-contain drop-shadow-2xl transition-all duration-300 ${
                          blendMode === 'multiply' ? 'mix-blend-multiply' : 'mix-blend-normal'
                        }`}
                      />
                    </div>
                    
                    {/* 3. Text Overlay */}
                    <AnimatePresence>
                      {showText && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-6 sm:p-8"
                        >
                          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 leading-tight drop-shadow-lg">
                            {adData.headline}
                          </h2>
                          <p className="text-sm sm:text-base text-zinc-200 drop-shadow-md max-w-md">
                            {adData.copy}
                          </p>
                          <div className="mt-6">
                            <button className="bg-white text-black px-6 py-2.5 rounded-full font-semibold text-sm hover:bg-zinc-200 transition-colors">
                              Shop Nu
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  <div className="mt-8 w-full max-w-2xl bg-zinc-950/50 p-6 rounded-2xl border border-zinc-800/50">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-zinc-400">Achtergrond Prompt</h4>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed">
                      {adData.backgroundPrompt}
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center max-w-sm"
                >
                  <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-6">
                    <ImageIcon className="w-8 h-8 text-zinc-700" />
                  </div>
                  <h3 className="text-xl font-medium text-zinc-300 mb-2">Nog geen creative</h3>
                  <p className="text-zinc-600">
                    Vul een product URL in. Wij downloaden de foto en plaatsen hem in een AI-gegenereerde omgeving.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  );
}
