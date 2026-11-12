import React, { useState, useEffect } from 'react';
import { SecurityState, ThemeConfig } from '../types';
import { soundEffects } from '../utils/soundEffects';
import { generateTOTP, verifyTOTP, encryptAES256, decryptAES256 } from '../utils/crypto';
import { Shield, Lock, Key, Cloud, CheckCircle, Copy, RefreshCw } from 'lucide-react';
import { useI18n } from '../i18n';

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
  const { t } = useI18n();
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
      setCipherOutput(t('modal.security.encryptError', { message: err.message }));
    }
  };

  const handleVerifyMfa = async () => {
    soundEffects.playKeyClick();
    if (!mfaInputCode.trim()) {
      setMfaFeedback({ msg: t('modal.security.codeRequired'), isError: true });
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
      setMfaFeedback({ msg: t('modal.security.verified'), isError: false });
    } else {
      soundEffects.playError();
      setMfaFeedback({ msg: t('modal.security.wrongToken'), isError: true });
    }
  };

  const handleCloudPush = async () => {
    soundEffects.playKeyClick();
    setIsSyncing(true);
    setSyncStatus(t('modal.security.encrypting'));

    const res = await onSyncPush(passkey);
    setIsSyncing(false);
    if (res.success) {
      soundEffects.playExecute();
      setSyncStatus(t('modal.security.syncOk', { message: res.message }));
    } else {
      soundEffects.playError();
      setSyncStatus(t('modal.security.syncError', { message: res.message }));
    }
  };

  const handleCloudPull = async () => {
    soundEffects.playKeyClick();
    if (security.mfaEnabled && !mfaInputCode.trim()) {
      setSyncStatus(t('modal.security.pullNeedsMfa'));
      return;
    }

    setIsSyncing(true);
    setSyncStatus(t('modal.security.pulling'));

    const res = await onSyncPull(passkey, mfaInputCode);
    setIsSyncing(false);
    if (res.success) {
      soundEffects.playExecute();
      setSyncStatus(t('modal.security.pullOk', { message: res.message }));
    } else {
      soundEffects.playError();
      setSyncStatus(t('modal.security.pullError', { message: res.message }));
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
            <span>{t('modal.security.title')}</span>
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
            <span>{t('modal.security.tabAes')}</span>
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
            <span>{t('modal.security.tabMfa')}</span>
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
            <span>{t('modal.security.tabSync')}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto space-y-4 text-xs">
          {activeTab === 'aes' && (
            <div className="space-y-3">
              <div className="p-3 border rounded-xs space-y-2" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <div className="font-bold flex items-center justify-between text-xs">
                  <span>{t('modal.security.vaultStatus')}</span>
                  <span className="text-emerald-400 flex items-center gap-1 font-bold">
                    <CheckCircle className="w-3.5 h-3.5" />
                    {t('modal.security.vaultActive')}
                  </span>
                </div>
                <div className="text-[11px] opacity-80 leading-relaxed">
                  {t('modal.security.vaultBody')}
                </div>
                <div className="flex items-center gap-2 pt-1 text-[11px]">
                  <span className="opacity-70">{t('modal.security.checksum')}</span>
                  <code className="font-bold text-[10px] truncate max-w-xs">{security.integrityChecksum}</code>
                </div>
              </div>

              {/* Master Passkey Input */}
              <div>
                <label className="block text-[10px] opacity-75 mb-0.5">{t('modal.security.passkeyLabel')}</label>
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
                    {security.vaultLocked ? t('modal.security.unlockVault') : t('modal.security.lockVault')}
                  </button>
                </div>
              </div>

              {/* Encryption Test Utility */}
              <div className="border p-3 rounded-xs space-y-2" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <div className="font-bold text-[11px]">{t('modal.security.tester')}</div>
                <div>
                  <label className="block text-[10px] opacity-75 mb-0.5">{t('modal.security.plainLabel')}</label>
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
                    {t('modal.security.encryptAction')}
                  </button>
                </div>
                {cipherOutput && (
                  <div className="space-y-1 pt-1 border-t text-[11px]" style={{ borderColor: theme.border }}>
                    <div className="opacity-75">{t('modal.security.packet')}</div>
                    <div className="p-1.5 border font-mono text-[10px] break-all max-h-16 overflow-y-auto" style={{ backgroundColor: theme.bg, borderColor: theme.border }}>
                      {cipherOutput}
                    </div>
                    {decryptedOutput && (
                      <div className="text-emerald-400 font-bold text-[11px]">
                        {t('modal.security.decryptedOk', { text: decryptedOutput })}
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
                  <span>{t('modal.security.totpTitle')}</span>
                  <span className={`px-2 py-0.5 border text-[10px] font-bold ${security.mfaEnabled ? 'text-emerald-400 border-emerald-400' : 'text-amber-400 border-amber-400'}`}>
                    {security.mfaEnabled ? t('modal.security.mfaEnabled') : t('modal.security.mfaNone')}
                  </span>
                </div>
                <div className="text-[11px] opacity-80 leading-relaxed">
                  {t('modal.security.mfaBody')}
                </div>
              </div>

              {/* Secret and Live Code Display */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border p-3 rounded-xs space-y-2" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                  <div className="text-[10px] opacity-75">{t('modal.security.secretLabel')}</div>
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
                      title={t('modal.security.copySecret')}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-[10px] opacity-60">
                    {t('modal.security.secretHint')}
                  </div>
                </div>

                <div className="border p-3 rounded-xs flex flex-col justify-between" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                  <div>
                    <div className="text-[10px] opacity-75">{t('modal.security.activeToken')}</div>
                    <div className="text-2xl font-bold tracking-widest text-center py-1 text-cyan-400 font-mono">
                      {currentTotp.code}
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] opacity-75 mb-1">
                      <span>{t('modal.security.clock')}</span>
                      <span>{t('modal.security.secondsLeft', { n: currentTotp.secondsRemaining })}</span>
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
                <div className="text-[11px] font-bold">{t('modal.security.verify')}</div>
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
                    {t('modal.security.validate')}
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
                  <span>{t('modal.security.syncTitle')}</span>
                  <span className="text-[11px] opacity-75">
                    {t('modal.security.lastBackup', {
                      date: security.lastBackup || t('modal.security.noBackup'),
                    })}
                  </span>
                </div>
                <div className="text-[11px] opacity-80 leading-relaxed">
                  {t('modal.security.syncBody')}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="border p-3 rounded-xs space-y-3 flex flex-col justify-between" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                  <div>
                    <h4 className="font-bold text-xs">{t('modal.security.pushTitle')}</h4>
                    <p className="text-[11px] opacity-75 mt-1">
                      {t('modal.security.pushBody')}
                    </p>
                  </div>
                  <button
                    disabled={isSyncing}
                    onClick={handleCloudPush}
                    className="w-full py-2 font-bold text-xs border rounded-xs hover:opacity-90 cursor-pointer flex items-center justify-center gap-2"
                    style={{ backgroundColor: theme.accent, color: theme.bg, borderColor: theme.accent }}
                  >
                    <Cloud className="w-4 h-4" />
                    <span>{t('modal.security.syncNow')}</span>
                  </button>
                </div>

                <div className="border p-3 rounded-xs space-y-3 flex flex-col justify-between" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                  <div>
                    <h4 className="font-bold text-xs">{t('modal.security.pullTitle')}</h4>
                    <p className="text-[11px] opacity-75 mt-1">
                      {t('modal.security.pullBody')}
                    </p>
                  </div>
                  <button
                    disabled={isSyncing}
                    onClick={handleCloudPull}
                    className="w-full py-2 font-bold text-xs border rounded-xs hover:opacity-80 cursor-pointer flex items-center justify-center gap-2"
                    style={{ borderColor: theme.border, backgroundColor: theme.bg }}
                  >
                    <RefreshCw className="w-4 h-4 text-cyan-400" />
                    <span>{t('modal.security.pullAction')}</span>
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
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
