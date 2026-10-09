/**
 * Minimal Lucide-style SVG icons, 18×18, stroke-width 2, currentColor.
 * Zero dependencies. All icons are inline SVGs for perfect color matching.
 */

const SIZE = 18;

const icon = (children: React.ReactNode, label: string, size = SIZE) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-label={label}
  >
    {children}
  </svg>
);

// ─── Toolbar ──────────────────────────────────────────────────
export const IconPlus = () =>
  icon(
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>,
    "新建便利贴",
  );

export const IconBold = () =>
  icon(
    <>
      <path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8" />
    </>,
    "加粗",
  );
export const IconItalic = () =>
  icon(
    <>
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
    </>,
    "斜体",
  );
export const IconStrikethrough = () =>
  icon(
    <>
      <path d="M16 4H9a3 3 0 0 0-2.83 4" />
      <path d="M14 12a4 4 0 0 1 0 8H6" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </>,
    "删除线",
  );
export const IconCode = () =>
  icon(
    <>
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </>,
    "行内代码",
  );

// Heading icons — wider spacing for dot readability
const HEAD_SIZE = 22;
const H = (
  <>
    <path d="M4 12h8" />
    <path d="M4 18V6" />
    <path d="M12 18V6" />
  </>
);
const D = (x: number, y: number) => <circle cx={x} cy={y} r="1.3" />;
// H spans x=4..12. Dots at x=17 (col 1) and x=20.5 (col 2). y=7/12/17 for 3 rows.
export const IconHeading1 = () =>
  icon(
    <>
      {H}
      {D(17, 12)}
    </>,
    "一级标题",
    HEAD_SIZE,
  );
export const IconHeading2 = () =>
  icon(
    <>
      {H}
      {D(17, 9)}
      {D(17, 15)}
    </>,
    "二级标题",
    HEAD_SIZE,
  );
export const IconHeading3 = () =>
  icon(
    <>
      {H}
      {D(17, 7)}
      {D(17, 12)}
      {D(17, 17)}
    </>,
    "三级标题",
    HEAD_SIZE,
  );
export const IconHeading4 = () =>
  icon(
    <>
      {H}
      {D(17, 9)}
      {D(17, 15)}
      {D(20.5, 9)}
      {D(20.5, 15)}
    </>,
    "四级标题",
    HEAD_SIZE,
  );
export const IconHeading5 = () =>
  icon(
    <>
      {H}
      {D(17, 7)}
      {D(17, 12)}
      {D(17, 17)}
      {D(20.5, 9)}
      {D(20.5, 15)}
    </>,
    "五级标题",
    HEAD_SIZE,
  );
export const IconHeading6 = () =>
  icon(
    <>
      {H}
      {D(17, 7)}
      {D(17, 12)}
      {D(17, 17)}
      {D(20.5, 7)}
      {D(20.5, 12)}
      {D(20.5, 17)}
    </>,
    "六级标题",
    HEAD_SIZE,
  );

export const IconList = () =>
  icon(
    <>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </>,
    "无序列表",
  );
export const IconListOrdered = () =>
  icon(
    <>
      <line x1="10" y1="6" x2="21" y2="6" />
      <line x1="10" y1="12" x2="21" y2="12" />
      <line x1="10" y1="18" x2="21" y2="18" />
      <path d="M4 6h1v4" />
      <path d="M4 10h2" />
      <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
    </>,
    "有序列表",
  );
export const IconChecklist = () =>
  icon(
    <>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </>,
    "任务列表",
  );
export const IconQuote = () =>
  icon(
    <>
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
    </>,
    "引用",
  );
export const IconHr = () =>
  icon(
    <>
      <path d="M5 12h14" />
    </>,
    "分割线",
  );
export const IconTable = () =>
  icon(
    <>
      <path d="M3 9h18M3 15h18" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </>,
    "表格",
  );
export const IconLink = () =>
  icon(
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>,
    "链接",
  );
export const IconImage = () =>
  icon(
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </>,
    "图片",
  );
export const IconSwap = () =>
  icon(
    <>
      <path d="m16 3 4 4-4 4" />
      <path d="M20 7H4" />
      <path d="m8 21-4-4 4-4" />
      <path d="M4 17h16" />
    </>,
    "交换",
  );
export const IconArchive = () =>
  icon(
    <>
      <path d="M4 9h16" />
      <path d="M4 5h16a1 1 0 0 1 1 1v2H3V6a1 1 0 0 1 1-1z" />
      <path d="M3 9v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9" />
      <path d="M10 13h4" />
    </>,
    "移入档案",
  );
export const IconMaximize = () =>
  icon(
    <>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </>,
    "打开主窗口",
  );
export const IconFloat = () =>
  icon(
    <>
      <path d="M4 4h13l3 3v13H4z" />
      <path d="M17 4v3h3" />
      <line x1="8" y1="13" x2="15" y2="13" />
      <line x1="8" y1="17" x2="13" y2="17" />
    </>,
    "打开浮窗",
  );
export const IconTrash = () =>
  icon(
    <>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </>,
    "清空",
  );
export const IconPopOut = () =>
  icon(
    <>
      <path d="M7 17 17 7" />
      <path d="M7 7h10v10" />
    </>,
    "浮窗",
  );
export const IconTag = () =>
  icon(
    <>
      <path d="M12 2H2v10l9.17 9.17a2 2 0 0 0 2.83 0l6.34-6.34a2 2 0 0 0 0-2.83L12 2Z" />
      <path d="M7 7h.01" />
    </>,
    "标签",
  );
export const IconUndo = () =>
  icon(
    <>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </>,
    "撤销",
  );
export const IconRedo = () =>
  icon(
    <>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
    </>,
    "重做",
  );

// ─── Status ────────────────────────────────────────────────────

export const IconCheck = () =>
  icon(
    <>
      <path d="M20 6 9 17l-5-5" />
    </>,
    "已保存",
    14,
  );
export const IconSaving = () =>
  icon(
    <>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </>,
    "保存中",
    14,
  );
export const IconUnsaved = () =>
  icon(
    <>
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3" />
    </>,
    "未保存",
    14,
  );
export const IconSun = () =>
  icon(
    <>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </>,
    "浅色模式",
    14,
  );
export const IconMoon = () =>
  icon(
    <>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </>,
    "深色模式",
    14,
  );
export const IconPin = () =>
  icon(
    <>
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-2.1c0-.7-.3-1.3-.8-1.7L16 11V5h1l-1-2H8L7 5h1v6l-2.2 2.2c-.5.4-.8 1-.8 1.7V17Z" />
    </>,
    "置顶",
    13,
  );
export const IconChevronLeft = () =>
  icon(
    <>
      <polyline points="15 18 9 12 15 6" />
    </>,
    "收起侧边栏",
    15,
  );
export const IconChevronRight = () =>
  icon(
    <>
      <polyline points="9 18 15 12 9 6" />
    </>,
    "展开侧边栏",
    15,
  );

// ─── Navigation ─────────────────────────────────────────────────

export const IconEye = () =>
  icon(
    <>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>,
    "预览",
    14,
  );
export const IconGear = () =>
  icon(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>,
    "设置",
    14,
  );
