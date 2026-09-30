'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api/client';
import { toast } from 'sonner';
import { 
  Sparkles, 
  Settings, 
  RefreshCw, 
  Info,
  Check,
  Cpu,
  Key,
  Globe
} from 'lucide-react';

interface Preferences {
  theme: string;
  font_family: string;
  editor_autosave_interval: number;
  default_sidebar_open: boolean;
  openai_api_key?: string;
  openai_base_url?: string;
  openai_model?: string;
}

export default function AISettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>({
    theme: 'system',
    font_family: 'sans',
    editor_autosave_interval: 3000,
    default_sidebar_open: true,
    openai_api_key: '',
    openai_base_url: '',
    openai_model: ''
  });

  // Local AI inputs
  const [localApiKey, setLocalApiKey] = useState('');
  const [localBaseUrl, setLocalBaseUrl] = useState('');
  const [localModel, setLocalModel] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const [me, aiConfig] = await Promise.all([
          authApi.getMe(),
          authApi.getAIConfig()
        ]);

        const prefs = (me.preferences as Partial<Preferences>) || {};
        const finalKey = aiConfig?.api_key || '';
        const finalBase = aiConfig?.base_url || '';
        const finalModel = aiConfig?.model || '';

        const finalPrefs = {
          theme: prefs.theme || 'system',
          font_family: prefs.font_family || 'sans',
          editor_autosave_interval: prefs.editor_autosave_interval !== undefined ? prefs.editor_autosave_interval : 3000,
          default_sidebar_open: prefs.default_sidebar_open !== undefined ? prefs.default_sidebar_open : true,
          openai_api_key: finalKey,
          openai_base_url: finalBase,
          openai_model: finalModel
        };
        setPreferences(finalPrefs);
        setLocalApiKey(finalKey);
        setLocalBaseUrl(finalBase);
        setLocalModel(finalModel);
      } catch (err) {
        console.error('加载 AI 配置出错:', err);
        toast.error('请先登录！');
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [router]);

  const handleSaveAIConfig = async () => {
    setSaving(true);
    const key = localApiKey.trim();
    const base = localBaseUrl.trim();
    const model = localModel.trim();

    try {
      await authApi.updateAIConfig({
        api_key: key,
        base_url: base,
        model: model
      });
      setPreferences(prev => ({
        ...prev,
        openai_api_key: key,
        openai_base_url: base,
        openai_model: model
      }));
      toast.success('AI 设置已成功保存！');
    } catch (err: any) {
      toast.error(`设置保存失败: ${err.message || '网络异常'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTestAIConnection = async () => {
    if (!localApiKey.trim()) {
      toast.error('请先输入 API Key！');
      return;
    }
    setTestingConnection(true);
    const toastId = toast.loading('正在测试 AI 接口连接中…');
    
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-User-AI-Key': localApiKey.trim(),
          'X-User-AI-Base': localBaseUrl.trim() || '',
          'X-User-AI-Model': localModel.trim() || ''
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Ping' }],
          model: localModel.trim() || undefined,
          temperature: 0.1
        })
      });

      if (res.ok) {
        const reader = res.body?.getReader();
        if (reader) {
          await reader.read();
          reader.cancel();
        }
        toast.success('🎉 连接成功！AI 助手及大模型接口响应正常。', { id: toastId });
      } else {
        const errText = await res.text();
        let errMsg = '接口返回错误';
        try {
          const errJson = JSON.parse(errText);
          errMsg = errJson.error || errJson.detail || errMsg;
        } catch {
          if (errText) errMsg = errText;
        }
        toast.error(`❌ 连接失败：${errMsg}`, { id: toastId });
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`❌ 网络连接异常：${err.message || '请检查 Base URL 是否正确'}`, { id: toastId });
    } finally {
      setTestingConnection(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <div className="neo-card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="animate-spin" style={{ width: '20px', height: '20px', border: '3px solid #000', borderTopColor: 'transparent', borderRadius: '50%' }} />
          <span style={{ fontWeight: 'bold' }}>正在努力加载 AI 设置…</span>
        </div>
      </div>
    );
  }

  return (
    <section id="ai-settings" className="content-section active" style={{ padding: '24px', overflowY: 'auto', height: '100%' }}>
      {/* 顶部 Neo Title */}
      <div 
        className="neo-card" 
        style={{ 
          background: 'var(--neo-orange)', 
          color: 'white', 
          borderColor: '#000000',
          padding: '24px', 
          borderRadius: '12px', 
          marginBottom: '24px',
          boxShadow: '6px 6px 0px 0px #000'
        }}
      >
        <h2 className="neo-title" style={{ fontSize: '24px', color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={24} /> AI 助手与大模型设置
        </h2>
        <p style={{ fontSize: '13px', marginTop: '6px', opacity: 0.95, fontWeight: 600 }}>
          配置您的自定义 AI 语言大模型底座。支持 OpenAI 与兼容 API 格式（如 DeepSeek, OpenRouter, LinkAI 等），用以驱动文档转换 OCR 和编辑器 AI 写作助手。
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
        
        {/* Left Card: AI configurations */}
        <div className="neo-card" style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', boxShadow: '6px 6px 0px 0px #000', height: 'fit-content' }}>
          <h3 className="neo-title" style={{ fontSize: '16px', borderBottom: '3.5px dashed #000', paddingBottom: '10px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cpu size={18} /> 大模型配置
          </h3>

          {/* API Key */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
              <Key size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
              API Key (接口密钥)
            </label>
            <input
              type="password"
              value={localApiKey}
              onChange={(e) => setLocalApiKey(e.target.value)}
              placeholder="sk-…"
              className="neo-input"
              style={{ width: '100%', padding: '10px', fontSize: '13px' }}
            />
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '4px', fontWeight: 600 }}>
              留空将默认使用系统提供的免费额度通道。支持 OpenAI 及兼容格式密钥。
            </span>
          </div>

          {/* API Base URL */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
              <Globe size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
              API Base URL (端点基址)
            </label>
            <input
              type="text"
              value={localBaseUrl}
              onChange={(e) => setLocalBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="neo-input"
              style={{ width: '100%', padding: '10px', fontSize: '13px' }}
            />
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '4px', fontWeight: 600 }}>
              默认为官方地址。若使用国内中转或三方代理，请填入对应的基址（包含 `/v1`）。
            </span>
          </div>

          {/* AI Model */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
              <Cpu size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} />
              自定义模型名称 (Model)
            </label>
            <input
              type="text"
              value={localModel}
              onChange={(e) => setLocalModel(e.target.value)}
              placeholder="gpt-4o-mini"
              className="neo-input"
              style={{ width: '100%', padding: '10px', fontSize: '13px' }}
            />
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginTop: '4px', fontWeight: 600 }}>
              例如：gpt-4o-mini、gpt-4o、deepseek-chat、gemini-2.5-flash、mimo-v2.5 等。
            </span>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              onClick={handleTestAIConnection}
              disabled={testingConnection}
              className="neo-btn"
              style={{ flex: 1, padding: '12px', fontSize: '13px', background: 'var(--bg-btn-secondary)', color: 'var(--text-primary)' }}
            >
              {testingConnection ? '连接测试中…' : '测试接口连接'}
            </button>
            <button
              type="button"
              onClick={handleSaveAIConfig}
              disabled={saving}
              className="neo-btn"
              style={{ flex: 1, padding: '12px', fontSize: '13px', background: 'var(--neo-yellow)', color: '#000' }}
            >
              {saving ? '正在保存…' : '保存 AI 配置'}
            </button>
          </div>
        </div>

        {/* Right Card: How Double-track AI system works */}
        <div className="neo-card" style={{ backgroundColor: 'var(--bg-card)', borderRadius: '12px', boxShadow: '6px 6px 0px 0px #000', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h3 className="neo-title" style={{ fontSize: '16px', borderBottom: '3.5px dashed #000', paddingBottom: '10px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Info size={18} /> 双轨制大模型通道说明
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontSize: '13px', lineHeight: '1.6' }}>
            <div>
              <h4 style={{ margin: '0 0 6px 0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--neo-blue)' }} />
                第一轨：系统默认免费额度
              </h4>
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                如果您<strong>不配置</strong>任何自定义密钥（即 Key 留空），知行笔记将自动为您接入我们预置的系统级免费大模型底座通道。能够零配置开箱即用，支持基本的 PDF 转换、写作润色和行动点自提取。
              </p>
            </div>

            <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '12px' }}>
              <h4 style={{ margin: '0 0 6px 0', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--neo-orange)' }} />
                第二轨：个人自定义通道 (高优先级)
              </h4>
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                一旦您在此页面配置并保存了<strong>自定义 API Key</strong>，系统将立即无缝切换为您的专属通道。所有 AI Copilot 侧边栏的交互和 MarkItDown 转换过程都将直连您的配置。您可以选择更强性能的模型（如 GPT-4o, DeepSeek-V3），且没有次数与用量限制。
              </p>
            </div>

            <div 
              style={{ 
                marginTop: '12px', 
                background: 'rgba(37, 99, 235, 0.05)', 
                border: '2px dashed var(--neo-blue)', 
                borderRadius: '8px', 
                padding: '12px',
                fontSize: '12px',
                color: 'var(--text-secondary)'
              }}
            >
              <div style={{ fontWeight: 'bold', color: 'var(--neo-blue)', marginBottom: '4px' }}>🔒 隐私与安全保障</div>
              您的自定义 API Key 仅经过高强度对称加密后本地存储于您的账户偏好设置中。每次请求均仅作为端点代理头部传输至我们的转换/对话服务，系统绝不留存或挪作他用。
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
