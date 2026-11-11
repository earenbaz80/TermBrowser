import React, { useState, useEffect } from 'react';
import { SecurityState, ThemeConfig } from '../types';
import { soundEffects } from '../utils/soundEffects';
import { generateTOTP, verifyTOTP, encryptAES256, decryptAES256 } from '../utils/crypto';
import { Shield, Lock, Key, Cloud, CheckCircle, Copy, RefreshCw } from 'lucide-react';

interface SecurityMfaModalProps {
  theme: ThemeConfig;
  isOpen: boolean;
  onClose: () => void;
  security: SecurityState;
  onUpdateSecurity: (sec: SecurityState) => void;
  onSyncPush: (passkey: string) => Promise<{ success: boolean; message: string }>;
  onSyncPull: (passkey: string, token: string) => Promise<{ success: boolean; message: string }>;
}

export const SecurityMfaModal: React.FC<SecurityMfaModalProps> = ({
  theme,
  isOpen,
  onClose,
  security,
  onUpdateSecurity,
  onSyncPush,
  onSyncPull,
}) => {
  const [activeTab, setActiveTab] = useState<'aes' | 'mfa' | 'sync'>('aes');
  const [passkey, setPasskey] = useState('master-termpass-2026');
  const [mfaInputCode, setMfaInputCode] = useState('');
  const [mfaFeedback, setMfaFeedback] = useState<{ msg: string; isError: boolean } | null>(null);

  // Live TOTP generator state
  const [currentTotp, setCurrentTotp] = useState<{ code: string; secondsRemaining: number }>({
    code: '------',
    secondsRemaining: 30,
  });

  // Fast text encryption tester state
  const [plainInput, setPlainInput] = useState('Mensaje ultra secreto en terminal');
  const [cipherOutput, setCipherOutput] = useState('');
  const [decryptedOutput, setDecryptedOutput] = useState('');

  // Cloud sync status
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Update TOTP code every second
  useEffect(() => {
    if (!isOpen || !security.mfaSecret) return;

    let isMounted = true;
    const updateCode = async () => {
      try {
        const totp = await generateTOTP(security.mfaSecret);
        if (isMounted) {
          setCurrentTotp(totp);
        }
      } catch (err) {
        console.error(err);
      }
    };

    updateCode();
    const interval = setInterval(updateCode, 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen, security.mfaSecret]);

  if (!isOpen) return null;

  const handleTestEncrypt = async () => {
    soundEffects.playKeyClick();
    try {
      const encrypted = await encryptAES256(plainInput, passkey);
      setCipherOutput(encrypted);
      const decrypted = await decryptAES256(encrypted, passkey);
      setDecryptedOutput(decrypted);
      soundEffects.playExecute();
    } catch (err: any) {
      soundEffects.playError();
      setCipherOutput(`Error de cifrado: ${err.message}`);
    }
  };

  const handleVerifyMfa = async () => {
    soundEffects.playKeyClick();
    if (!mfaInputCode.trim()) {
      setMfaFeedback({ msg: 'Ingrese el token de 6 dígitos.', isError: true });
      return;
    }

    const isValid = await verifyTOTP(mfaInputCode, security.mfaSecret);
    if (isValid) {
      soundEffects.playExecute();
      onUpdateSecurity({
        ...security,
        mfaVerified: true,
        mfaEnabled: true,
      });
      setMfaFeedback({ msg: 'Token MFA verificado con éxito. Sesión de doble factor confirmada.', isError: false });
    } else {
      soundEffects.playError();
      setMfaFeedback({ msg: 'Token MFA incorrecto o expirado. Verifique el reloj del sistema.', isError: true });
    }
  };

  const handleCloudPush = async () => {
    soundEffects.playKeyClick();
    setIsSyncing(true);
    setSyncStatus('Cifrando bóveda con AES-256 y transmitiendo a la nube...');

    const res = await onSyncPush(passkey);
    setIsSyncing(false);
    if (res.success) {
      soundEffects.playExecute();
      setSyncStatus(`✓ Éxito: ${res.message}`);
    } else {
      soundEffects.playError();
      setSyncStatus(`✗ Error: ${res.message}`);
    }
  };

  const handleCloudPull = async () => {
    soundEffects.playKeyClick();
    if (security.mfaEnabled && !mfaInputCode.trim()) {
      setSyncStatus('✗ Requiere ingresar el código MFA activo para restaurar la bóveda.');
      return;
    }

    setIsSyncing(true);
    setSyncStatus('Descargando bóveda cifrada y validando token MFA...');

    const res = await onSyncPull(passkey, mfaInputCode);
    setIsSyncing(false);
    if (res.success) {
      soundEffects.playExecute();
      setSyncStatus(`✓ Restauración completa: ${res.message}`);
    } else {
      soundEffects.playError();
      setSyncStatus(`✗ Error al restaurar: ${res.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-xs font-mono">
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col border shadow-2xl rounded-xs overflow-hidden"
        style={{
          backgroundColor: theme.bg,
          borderColor: theme.border,
          color: theme.text,
        }}
      >
        {/* Title Bar */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b select-none text-xs"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          <div className="flex items-center gap-2 font-bold">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>CENTRO DE SEGURIDAD AES-256, MFA & SINCRONIZACIÓN EN LA NUBE</span>
          </div>
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              onClose();
            }}
            className="px-2 py-0.5 border font-bold hover:bg-red-900/40 cursor-pointer"
            style={{ borderColor: theme.border }}
          >
            [X]
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b text-xs font-bold" style={{ borderColor: theme.border, backgroundColor: theme.cardBg }}>
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              setActiveTab('aes');
            }}
            className={`px-4 py-2 flex items-center gap-2 border-r transition-colors cursor-pointer ${
              activeTab === 'aes' ? 'bg-white/10 text-emerald-400' : 'opacity-70 hover:opacity-100'
            }`}
            style={{ borderColor: theme.border }}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>CIFRADO AES-256-GCM</span>
          </button>
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              setActiveTab('mfa');
            }}
            className={`px-4 py-2 flex items-center gap-2 border-r transition-colors cursor-pointer ${
              activeTab === 'mfa' ? 'bg-white/10 text-cyan-400' : 'opacity-70 hover:opacity-100'
            }`}
            style={{ borderColor: theme.border }}
          >
            <Key className="w-3.5 h-3.5" />
            <span>DOBLE FACTOR (MFA)</span>
          </button>
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              setActiveTab('sync');
            }}
            className={`px-4 py-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'sync' ? 'bg-white/10 text-amber-400' : 'opacity-70 hover:opacity-100'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>NUBE SEGURA</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {activeTab === 'aes' && (
            <div className="space-y-3">
              <div className="p-3 border rounded-xs space-y-2" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <div className="font-bold flex items-center justify-between text-xs">
                  <span>ESTADO DE LA BÓVEDA LOCAL:</span>
                  <span className="text-emerald-400 flex items-center gap-1 font-bold">
                    <CheckCircle className="w-3.5 h-3.5" />
                    AES-256-GCM ACTIVO & VERIFICADO
                  </span>
                </div>
                <div className="text-[11px] opacity-80 leading-relaxed">
                  Todas las credenciales, historial de navegación, bookmarks, scripts y tokens se cifran localmente mediante Web Crypto API antes de ser persistidos.
                </div>
                <div className="flex items-center gap-2 pt-1 text-[11px]">
                  <span className="opacity-70">CHECKSUM DE INTEGRIDAD SHA-256:</span>
                  <code className="font-bold text-[10px] truncate max-w-xs">{security.integrityChecksum}</code>
                </div>
              </div>

              {/* Master Passkey Input */}
              <div>
                <label className="block text-[10px] opacity-75 mb-0.5">CONTRASEÑA MAESTRA / LLAVE DE CIFRADO</label>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    value={passkey}
                    onChange={(e) => setPasskey(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs border rounded-xs font-mono focus:outline-hidden"
                    style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.text }}
                  />
                  <button
                    onClick={() => {
                      soundEffects.playKeyClick();
                      onUpdateSecurity({ ...security, vaultLocked: !security.vaultLocked });
                    }}
                    className="px-3 py-1 border text-xs font-bold cursor-pointer"
                    style={{ borderColor: theme.border }}
                  >
                    {security.vaultLocked ? 'Desbloquear Bóveda' : 'Bloquear Bóveda'}
                  </button>
                </div>
              </div>

              {/* Encryption Test Utility */}
              <div className="border p-3 rounded-xs space-y-2" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <div className="font-bold text-[11px]">PROBADOR INTERACTIVO DE CIFRADO AES-256</div>
                <div>
                  <label className="block text-[10px] opacity-75 mb-0.5">TEXTO PLANO A CIFRAR:</label>
                  <input
                    type="text"
                    value={plainInput}
                    onChange={(e) => setPlainInput(e.target.value)}
                    className="w-full px-2 py-1 text-xs border rounded-xs focus:outline-hidden"
                    style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }}
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleTestEncrypt}
                    className="px-3 py-1 text-xs font-bold border rounded-xs hover:opacity-90 cursor-pointer"
                    style={{ backgroundColor: theme.accent, color: theme.bg, borderColor: theme.accent }}
                  >
                    Cifrar y Descifrar (AES-256)
                  </button>
                </div>
                {cipherOutput && (
                  <div className="space-y-1 pt-1 border-t text-[11px]" style={{ borderColor: theme.border }}>
                    <div className="opacity-75">PAQUETE CIFRADO (SALT.IV.CIPHERTEXT):</div>
                    <div className="p-1.5 border font-mono text-[10px] break-all max-h-16 overflow-y-auto" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
                      {cipherOutput}
                    </div>
                    {decryptedOutput && (
                      <div className="text-emerald-400 font-bold text-[11px]">
                        ✓ Descifrado verificado: "{decryptedOutput}"
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'mfa' && (
            <div className="space-y-3">
              <div className="p-3 border rounded-xs space-y-2" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <div className="font-bold text-xs flex items-center justify-between">
                  <span>AUTENTICADOR TOTP (RFC 6238)</span>
                  <span className={`px-2 py-0.5 border text-[10px] font-bold ${security.mfaEnabled ? 'text-emerald-400 border-emerald-400' : 'text-amber-400 border-amber-400'}`}>
                    {security.mfaEnabled ? 'MFA HABILITADO' : 'MFA NO CONFIGURADO'}
                  </span>
                </div>
                <div className="text-[11px] opacity-80 leading-relaxed">
                  Generación de códigos de un solo uso basados en tiempo (30 segundos). Compatible con Google Authenticator, Authy y terminales seguras.
                </div>
              </div>

              {/* Secret and Live Code Display */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border p-3 rounded-xs space-y-2" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                  <div className="text-[10px] opacity-75">CLAVE SECRETA TOTP (BASE32):</div>
                  <div className="flex items-center gap-2">
                    <code className="p-1.5 border flex-1 text-center font-bold text-xs tracking-widest" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
                      {security.mfaSecret}
                    </code>
                    <button
                      onClick={() => {
                        soundEffects.playKeyClick();
                        navigator.clipboard.writeText(security.mfaSecret);
                      }}
                      className="p-1.5 border hover:opacity-80 cursor-pointer"
                      style={{ borderColor: theme.border }}
                      title="Copiar secreto"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-[10px] opacity-60">
                    Guarde este secreto en su aplicación de autenticación para vincular su terminal.
                  </div>
                </div>

                <div className="border p-3 rounded-xs flex flex-col justify-between" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                  <div>
                    <div className="text-[10px] opacity-75">TOKEN ACTIVO GENERADO:</div>
                    <div className="text-2xl font-bold tracking-widest text-center py-1 text-cyan-400 font-mono">
                      {currentTotp.code}
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] opacity-75 mb-1">
                      <span>RELOJ TOTP:</span>
                      <span>{currentTotp.secondsRemaining}s restantes</span>
                    </div>
                    <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-400 transition-all duration-1000"
                        style={{ width: `${(currentTotp.secondsRemaining / 30) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Verify form */}
              <div className="border p-3 rounded-xs space-y-2" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <div className="text-[11px] font-bold">VERIFICAR TOKEN DE ACCESO</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="000000"
                    value={mfaInputCode}
                    onChange={(e) => setMfaInputCode(e.target.value.replace(/\D/g, ''))}
                    className="w-32 px-3 py-1.5 text-center text-sm font-bold tracking-widest border rounded-xs focus:outline-hidden"
                    style={{ backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }}
                  />
                  <button
                    onClick={handleVerifyMfa}
                    className="px-4 py-1.5 text-xs font-bold border rounded-xs hover:opacity-90 cursor-pointer"
                    style={{ backgroundColor: theme.accent, color: theme.bg, borderColor: theme.accent }}
                  >
                    Validar Token
                  </button>
                </div>
                {mfaFeedback && (
                  <div className={`text-[11px] font-bold ${mfaFeedback.isError ? 'text-red-400' : 'text-emerald-400'}`}>
                    {mfaFeedback.msg}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'sync' && (
            <div className="space-y-3">
              <div className="p-3 border rounded-xs space-y-2" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <div className="font-bold text-xs flex items-center justify-between">
                  <span>SINCRONIZACIÓN EN LA NUBE CON SELLO AES-256</span>
                  <span className="text-[11px] opacity-75">
                    Último respaldo: {security.lastBackup || 'Sin respaldo aún'}
                  </span>
                </div>
                <div className="text-[11px] opacity-80 leading-relaxed">
                  Permite exportar y sincronizar remotamente el estado completo de la terminal mediante una bóveda encriptada protegida por su clave maestra y verificación MFA.
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border p-3 rounded-xs space-y-3 flex flex-col justify-between" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                  <div>
                    <h4 className="font-bold text-xs">SUBIR RESPALDO A LA NUBE (PUSH)</h4>
                    <p className="text-[11px] opacity-75 mt-1">
                      Cifra pestañas, marcadores, historial y scripts con AES-256 y envía el paquete al microservicio remoto.
                    </p>
                  </div>
                  <button
                    disabled={isSyncing}
                    onClick={handleCloudPush}
                    className="w-full py-2 font-bold text-xs border rounded-xs hover:opacity-90 cursor-pointer flex items-center justify-center gap-2"
                    style={{ backgroundColor: theme.accent, color: theme.bg, borderColor: theme.accent }}
                  >
                    <Cloud className="w-4 h-4" />
                    <span>SINCRONIZAR AHORA</span>
                  </button>
                </div>

                <div className="border p-3 rounded-xs space-y-3 flex flex-col justify-between" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                  <div>
                    <h4 className="font-bold text-xs">RESTAURAR DESDE LA NUBE (PULL)</h4>
                    <p className="text-[11px] opacity-75 mt-1">
                      Descarga el paquete remoto, valida la clave maestra y el token MFA de 6 dígitos para restaurar su entorno.
                    </p>
                  </div>
                  <button
                    disabled={isSyncing}
                    onClick={handleCloudPull}
                    className="w-full py-2 font-bold text-xs border rounded-xs hover:opacity-80 cursor-pointer flex items-center justify-center gap-2"
                    style={{ borderColor: theme.border, backgroundColor: theme.bg }}
                  >
                    <RefreshCw className="w-4 h-4 text-cyan-400" />
                    <span>DESCARGAR Y RESTAURAR</span>
                  </button>
                </div>
              </div>

              {syncStatus && (
                <div className="p-2 border text-[11px] font-mono rounded-xs" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                  {syncStatus}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-3 py-2 border-t text-xs flex justify-end"
          style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}
        >
          <button
            onClick={() => {
              soundEffects.playKeyClick();
              onClose();
            }}
            className="px-4 py-1 border text-xs font-bold cursor-pointer"
            style={{ borderColor: theme.border }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
