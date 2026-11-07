import React, { useState } from 'react';
import { ThemeConfig, WebpagePayload } from '../types';
import { soundEffects } from '../utils/soundEffects';
import {
  Globe,
  Image as ImageIcon,
  ExternalLink,
  BookOpen,
  Eye,
  EyeOff,
  Link2,
  Lock,
  ArrowRight,
  Maximize2,
  Check,
} from 'lucide-react';

interface TerminalWebpageViewProps {
  theme: ThemeConfig;
  webpage: WebpagePayload;
  onNavigate: (url: string) => void;
  onOpenSplitWeb?: (url: string) => void;
}

export const TerminalWebpageView: React.FC<TerminalWebpageViewProps> = ({
  theme,
  webpage,
  onNavigate,
  onOpenSplitWeb,
}) => {
  const [showImages, setShowImages] = useState(true);
  const [showLinks, setShowLinks] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const imagesCount = webpage.images ? webpage.images.length : 0;
  const linksCount = webpage.links ? webpage.links.length : 0;

  return (
    <div
      className="my-3 border rounded-xs font-mono text-xs overflow-hidden select-text shadow-lg"
      style={{
        backgroundColor: theme.cardBg,
        borderColor: theme.border,
        color: theme.text,
      }}
    >
      {/* MS-DOS Lynx/Arachne ASCII Header Banner */}
      <div
        className="px-3 py-2 border-b select-none flex flex-col sm:flex-row sm:items-center justify-between gap-2"
        style={{
          backgroundColor: theme.bg,
          borderColor: theme.border,
        }}
      >
        <div className="space-y-0.5 truncate">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[11px] text-amber-400">
              ╔═[ TERMBROWSER LYNX/ARACHNE MS-DOS WEB VIEW ]═╗
            </span>
            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5">
              <Lock className="w-2.5 h-2.5" /> AES-256
            </span>
          </div>
          <div className="font-bold text-xs truncate" style={{ color: theme.accent }}>
            {webpage.title || webpage.url}
          </div>
          <div className="text-[10px] opacity-70 truncate font-mono">
            URL: {webpage.url} · HTTP {webpage.statusCode || 200} · {webpage.latencyMs || 25}ms
          </div>
        </div>

        {/* View Controls Toolbar */}
        <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
          {imagesCount > 0 && (
            <button
              onClick={() => {
                soundEffects.playKeyClick();
                setShowImages(!showImages);
              }}
              className="flex items-center gap-1 px-2 py-1 border text-[10px] font-bold rounded-xs cursor-pointer hover:bg-white/10"
              style={{ borderColor: theme.border }}
              title="Mostrar u ocultar imágenes reales en terminal"
            >
              {showImages ? <EyeOff className="w-3 h-3 text-red-400" /> : <Eye className="w-3 h-3 text-emerald-400" />}
              <span>{showImages ? 'Ocultar Fotos' : `Ver Fotos (${imagesCount})`}</span>
            </button>
          )}

          {linksCount > 0 && (
            <button
              onClick={() => {
                soundEffects.playKeyClick();
                setShowLinks(!showLinks);
              }}
              className="flex items-center gap-1 px-2 py-1 border text-[10px] font-bold rounded-xs cursor-pointer hover:bg-white/10"
              style={{ borderColor: theme.border }}
              title="Mostrar enlaces extraídos"
            >
              <Link2 className="w-3 h-3 text-cyan-400" />
              <span>Enlaces ({linksCount})</span>
            </button>
          )}

          {onOpenSplitWeb && (
            <button
              onClick={() => {
                soundEffects.playKeyClick();
                onOpenSplitWeb(webpage.url);
              }}
              className="flex items-center gap-1 px-2 py-1 border text-[10px] font-bold rounded-xs cursor-pointer hover:opacity-90"
              style={{
                backgroundColor: theme.accent,
                color: theme.bg,
                borderColor: theme.accent,
              }}
              title="Abrir en visor web completo de la derecha"
            >
              <Globe className="w-3 h-3" />
              <span>Visor Web</span>
            </button>
          )}
        </div>
      </div>

      {/* Real Images Gallery Inside Terminal (MS-DOS Graphical Mode) */}
      {showImages && imagesCount > 0 && (
        <div className="p-3 border-b space-y-2 bg-black/30" style={{ borderColor: theme.border }}>
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span className="flex items-center gap-1.5 text-amber-400">
              <ImageIcon className="w-3.5 h-3.5" />
              <span>IMÁGENES REALES EXTRAÍDAS DEL SITIO ({imagesCount}):</span>
            </span>
            <span className="text-[10px] opacity-60">Haga clic sobre una imagen para ampliar</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {webpage.images.map((img, idx) => (
              <div
                key={idx}
                onClick={() => {
                  soundEffects.playKeyClick();
                  setSelectedImage(selectedImage === img.src ? null : img.src);
                }}
                className="group relative border rounded-xs overflow-hidden cursor-pointer bg-black/60 transition-transform active:scale-95 hover:border-emerald-400"
                style={{ borderColor: theme.border }}
              >
                <div className="aspect-video w-full overflow-hidden flex items-center justify-center bg-black/40">
                  <img
                    src={img.src}
                    alt={img.alt || `Imagen ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-opacity duration-300 group-hover:opacity-90"
                    loading="lazy"
                    onError={(e) => {
                      // Fallback visual container if hotlinking fails
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
                <div className="p-1.5 border-t text-[10px] truncate opacity-80 font-mono" style={{ borderColor: theme.border }}>
                  {img.alt || `img_${idx + 1}.jpg`}
                </div>
              </div>
            ))}
          </div>

          {/* Full preview overlay for clicked image */}
          {selectedImage && (
            <div
              className="p-2 border rounded-xs bg-black/80 space-y-1 relative"
              style={{ borderColor: theme.accent }}
            >
              <div className="flex items-center justify-between text-[10px] font-bold pb-1 border-b" style={{ borderColor: theme.border }}>
                <span>VISTA AMPLIADA DE IMAGEN</span>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="px-1.5 py-0.5 border text-red-400 font-bold cursor-pointer"
                  style={{ borderColor: theme.border }}
                >
                  Cerrar
                </button>
              </div>
              <div className="flex items-center justify-center p-2">
                <img
                  src={selectedImage}
                  alt="Vista previa ampliada"
                  referrerPolicy="no-referrer"
                  className="max-h-72 max-w-full rounded-xs object-contain border"
                  style={{ borderColor: theme.border }}
                />
              </div>
              <div className="text-[10px] opacity-70 truncate font-mono text-center">
                {selectedImage}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Content Body in Lynx / MS-DOS Terminal Typography */}
      <div className="p-3.5 space-y-3 leading-relaxed">
        {/* Headings */}
        {webpage.headings && webpage.headings.length > 0 && (
          <div className="space-y-1 pb-2 border-b" style={{ borderColor: theme.border }}>
            <div className="text-[10px] font-bold opacity-60 uppercase tracking-wider">
              ENCABEZADOS DETECTADOS:
            </div>
            {webpage.headings.slice(0, 4).map((h, i) => (
              <div key={i} className="font-bold text-xs" style={{ color: theme.accent }}>
                ► {h}
              </div>
            ))}
          </div>
        )}

        {/* Text Paragraphs */}
        {webpage.paragraphs && webpage.paragraphs.length > 0 ? (
          <div className="space-y-2.5 text-xs opacity-90 font-mono">
            {webpage.paragraphs.slice(0, 6).map((p, idx) => (
              <p key={idx} className="leading-normal">
                {p}
              </p>
            ))}
          </div>
        ) : (
          <div className="text-xs opacity-80 font-mono">
            {webpage.summary || 'Página web renderizada con éxito bajo el motor MS-DOS.'}
          </div>
        )}

        {/* Clickable Hyperlinks Drawer */}
        {showLinks && webpage.links && webpage.links.length > 0 && (
          <div
            className="p-3 border rounded-xs space-y-2 mt-3 bg-black/40"
            style={{ borderColor: theme.border }}
          >
            <div className="font-bold text-[11px] text-cyan-400 flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              <span>ENLACES CLICABLES DEL SITIO (PULSE PARA NAVEGAR DIRECTAMENTE):</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {webpage.links.slice(0, 10).map((l, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    soundEffects.playKeyClick();
                    onNavigate(l.href);
                  }}
                  className="p-1.5 border text-left rounded-xs hover:bg-white/10 cursor-pointer flex items-center justify-between gap-2 transition-colors font-mono"
                  style={{ borderColor: theme.border }}
                  title={`Ir a: ${l.href}`}
                >
                  <span className="truncate text-[11px] font-semibold text-slate-200">
                    [{idx + 1}] {l.text || l.href}
                  </span>
                  <ArrowRight className="w-3 h-3 shrink-0 opacity-60 text-emerald-400" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Terminal Web View Footer */}
      <div
        className="px-3 py-1.5 border-t text-[10px] flex items-center justify-between select-none opacity-70"
        style={{ backgroundColor: theme.bg, borderColor: theme.border }}
      >
        <span>MODO TERMINAL MS-DOS CON IMÁGENES REALES</span>
        <span>Escriba "goto &lt;url&gt;" o haga clic en cualquier enlace para continuar</span>
      </div>
    </div>
  );
};
