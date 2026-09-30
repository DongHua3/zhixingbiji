'use client';

import React from 'react';
import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  linkPlugin,
  linkDialogPlugin,
  imagePlugin,
  tablePlugin,
  codeBlockPlugin,
  codeMirrorPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  CreateLink,
  InsertTable,
  InsertCodeBlock,
  InsertThematicBreak,
  MDXEditorMethods
} from '@mdxeditor/editor';
import '@mdxeditor/editor/style.css';
import { storageApi } from '@/lib/api/client';
import { toast } from 'sonner';

interface InitializedMDXEditorProps {
  markdown: string;
  ref?: React.Ref<MDXEditorMethods | null>;
  onChange: (markdown: string) => void;
  readOnly?: boolean;
  mode?: 'regular' | 'markdown';
}

const zhTranslation = (key: string, defaultValue: string, interpolations?: Record<string, unknown>) => {
  const dict: Record<string, string> = {
    'Paragraph': '正文',
    'Quote': '引用',
    'Select block type': '选择格式',
    'Block type': '格式',
    'Undo': '撤销',
    'Redo': '重做',
    'Bold': '加粗',
    'Italic': '斜体',
    'Underline': '下划线',
    'Strikethrough': '删除线',
    'Bulleted list': '无序列表',
    'Numbered list': '有序列表',
    'Create link': '插入链接',
    'Insert image': '插入图片',
    'Upload an image': '上传图片',
    'Choose a file': '选择文件',
    'Insert Table': '插入表格',
    'Insert Code Block': '插入代码块',
    'Insert thematic break': '插入分割线',
    'Edit link': '编辑链接',
    'Save': '保存',
    'Cancel': '取消',
    'URL': '链接地址',
    'Title': '标题',
    'Alt text': '替代文本',
    'Delete': '删除',
    'Insert row above': '在上方插入行',
    'Insert row below': '在下方插入行',
    'Insert column left': '在左侧插入列',
    'Insert column right': '在右侧插入列',
    'Delete row': '删除行',
    'Delete column': '删除列',
    'Align left': '左对齐',
    'Align center': '居中',
    'Align right': '右对齐',
    'Check list': '任务列表',
    'Rich text': '富文本',
    'Markdown': 'Markdown源码',
    'Table': '表格',
    'Image': '图片',
    'Link': '链接',
    'Code block': '代码块',
    'Thematic break': '分割线',
    'Code': '代码',
    'Heading 1': '标题 1',
    'Heading 2': '标题 2',
    'Heading 3': '标题 3',
    'Heading 4': '标题 4',
    'Heading 5': '标题 5',
    'Heading 6': '标题 6',
    'Remove link': '移除链接',
    'Open in new tab': '在新标签页打开',
    'Copy link': '复制链接',
    'Edit link URL': '编辑链接',
    'Copy link to clipboard': '复制链接',
  };
  
  if (defaultValue === 'Heading {{level}}') return `标题 ${interpolations?.level || ''}`;

  let res = dict[defaultValue] || defaultValue;
  if (interpolations) {
    for (const [k, v] of Object.entries(interpolations)) {
      res = res.replace(`{{${k}}}`, String(v));
    }
  }
  return res;
};

// Custom image upload handler to local storage
const imageUploadHandler = async (image: File): Promise<string> => {
  if (!image.type.startsWith('image/')) {
    toast.error('只能上传图片文件 (JPEG, PNG, GIF, WebP)');
    throw new Error('Not an image');
  }
  if (image.size > 10 * 1024 * 1024) {
    toast.error('图片不能超过 10MB');
    throw new Error('Image too large');
  }

  try {
    const res = await storageApi.upload(image, 'note_images');
    return res.url;
  } catch (err: any) {
    console.error('Image upload failed:', err);
    toast.error(err.message || '上传失败，请重试');
    throw err;
  }
};

import { Image as ImageIcon } from 'lucide-react';

export default function InitializedMDXEditor({
  markdown,
  ref,
  onChange,
  readOnly = false,
  mode = 'regular'
}: InitializedMDXEditorProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const refObject = ref as React.MutableRefObject<MDXEditorMethods | null>;
    if (refObject && refObject.current) {
      const currentMarkdown = refObject.current.getMarkdown();
      if (currentMarkdown !== markdown) {
        refObject.current.setMarkdown(markdown || '');
      }
    }
  }, [markdown, ref]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // Reset input
    const toastId = toast.loading('上传图片中...');
    try {
      const url = await imageUploadHandler(file);
      const refObject = ref as React.MutableRefObject<MDXEditorMethods | null>;
      if (refObject && refObject.current) {
        refObject.current.insertMarkdown(`\n![图片描述](${url})\n`);
      }
      toast.success('图片上传成功', { id: toastId });
    } catch (error) {
      toast.error('上传失败', { id: toastId });
      console.error(error);
    }
  };

  const plugins = [
    headingsPlugin(),
    listsPlugin(),
    quotePlugin(),
    thematicBreakPlugin(),
    markdownShortcutPlugin(),
    linkPlugin(),
    linkDialogPlugin(),
    tablePlugin(),
    imagePlugin({ imageUploadHandler })
  ];

  if (mode === 'markdown') {
    plugins.push(codeBlockPlugin({ defaultCodeBlockLanguage: 'js' }));
    plugins.push(codeMirrorPlugin({ 
      codeBlockLanguages: { 
        js: 'JavaScript', 
        ts: 'TypeScript', 
        css: 'CSS', 
        html: 'HTML', 
        json: 'JSON', 
        py: 'Python', 
        bash: 'Bash', 
        go: 'Go',
        '': 'Plain Text' 
      } 
    }));
  }

  if (!readOnly) {
    plugins.push(
      toolbarPlugin({
        toolbarContents: () => (
          <>
            <UndoRedo />
            <div style={{ width: '8px' }} />
            <BlockTypeSelect />
            <div style={{ width: '8px' }} />
            <BoldItalicUnderlineToggles />
            <div style={{ width: '8px' }} />
            <ListsToggle />
            <div style={{ width: '8px' }} />
            <InsertTable />
            
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="插入图片"
              style={{
                background: 'transparent',
                border: 'none',
                borderRadius: '4px',
                minWidth: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#475569',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#e2e8f0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <ImageIcon size={18} />
            </button>

            <CreateLink />
            
            {mode === 'markdown' && (
              <>
                <div style={{ width: '8px' }} />
                <InsertCodeBlock />
                <InsertThematicBreak />
              </>
            )}
          </>
        )
      })
    );
  }

  return (
    <>
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        accept="image/*" 
        onChange={handleFileChange} 
      />
      <MDXEditor
        ref={ref}
        markdown={markdown}
        onChange={onChange}
        readOnly={readOnly}
        translation={zhTranslation}
        plugins={plugins}
        className="zxbj-mdx-editor"
        suppressHtmlProcessing={true}
      />
    </>
  );
}
