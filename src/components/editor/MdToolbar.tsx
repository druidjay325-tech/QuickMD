import { memo, useState, useRef, useEffect } from "react";
import {
  IconBold,
  IconItalic,
  IconStrikethrough,
  IconCode,
  IconHeading1,
  IconHeading2,
  IconHeading3,
  IconHeading4,
  IconHeading5,
  IconHeading6,
  IconList,
  IconQuote,
  IconHr,
  IconTable,
  IconLink,
  IconImage,
  IconUndo,
  IconRedo,
} from "../Icons";
import "./MdToolbar.css";

interface CodeEditorHandle {
  getContent: () => string;
  getSelection: () => { start: number; end: number; text: string };
  replaceSelection: (text: string) => void;
  selectRange: (start: number, end: number) => void;
  focus: () => void;
}

interface MdToolbarProps {
  editorRef: React.MutableRefObject<CodeEditorHandle | null>;
  onInsertImage?: () => void;
  disabled?: boolean;
}

/* ── Dropdown button ─────────────────────────────────────── */

function Dropdown({
  title,
  icon,
  open,
  onToggle,
  children,
  active,
  disabled,
}: {
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  active?: boolean | string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || disabled) return;
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open, onToggle, disabled]);

  return (
    <div
      className={`md-btn-dropdown${open ? " open" : ""}${disabled ? " toolbar-disabled" : ""}`}
      ref={ref}
    >
      <div
        className={`md-btn${active ? " active" : ""}`}
        role="button"
        tabIndex={0}
        title={title}
        aria-disabled={disabled}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onToggle();
          }
        }}
        onClick={disabled ? undefined : onToggle}
        style={disabled ? { pointerEvents: "none" } : undefined}
      >
        {icon}
        <span className="md-btn-arrow">▾</span>
      </div>
      {open && !disabled && <div className="md-dropdown-menu">{children}</div>}
    </div>
  );
}

/* ── Btn ──────────────────────────────────────────────────── */

function Btn({
  title,
  children,
  onClick,
  active,
  disabled,
}: {
  title: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <div
      className={`md-btn${active ? " active" : ""}${disabled ? " toolbar-disabled" : ""}`}
      role="button"
      tabIndex={0}
      title={title}
      aria-disabled={disabled}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      onClick={disabled ? undefined : onClick}
      style={disabled ? { pointerEvents: "none" } : undefined}
    >
      {children}
    </div>
  );
}

function DropdownItem({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <div
      className="md-dropdown-item"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

/* ── Toolbar ──────────────────────────────────────────────── */

function MdToolbar({
  editorRef,
  onInsertImage,
  disabled = false,
}: MdToolbarProps) {
  const [headingOpen, setHeadingOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [, setTick] = useState(0);

  const ed = () => editorRef.current;

  // Listen to selection changes so toolbar reflects cursor position in real-time
  useEffect(() => {
    const onSelChange = () => {
      const el = document.activeElement;
      // Only react to selection changes inside the editor textarea
      if (
        el &&
        (el as HTMLElement).tagName === "TEXTAREA" &&
        (el as HTMLElement).classList.contains("code-editor-textarea")
      ) {
        setTick((n) => n + 1);
      }
    };
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, []);

  const headingIcons = [
    IconHeading1,
    IconHeading2,
    IconHeading3,
    IconHeading4,
    IconHeading5,
    IconHeading6,
  ];

  const getHeadingLevel = (): number => {
    const e = ed();
    if (!e) return 0;
    const content = e.getContent();
    const sel = e.getSelection();
    if (!sel) return 0;
    const start = sel.start;

    // Walk backwards from cursor to find line start
    let i = start - 1;
    while (i >= 0 && content[i] !== "\n" && content[i] !== "\r") i--;
    const lineStart = i + 1;

    // Count leading # at line start
    let level = 0;
    while (
      level < 6 &&
      lineStart + level < content.length &&
      content[lineStart + level] === "#"
    ) {
      level++;
    }
    // Must be followed by space or end of line
    if (
      level > 0 &&
      lineStart + level < content.length &&
      content[lineStart + level] === " "
    ) {
      return level;
    }
    return 0; // No heading on this line
  };

  /* ── Format detection ───────────────────────────────────── */

  type ListType = "none" | "unordered" | "ordered" | "task";

  interface FormatState {
    bold: boolean;
    italic: boolean;
    strike: boolean;
    icode: boolean;
    list: ListType;
    quote: boolean;
    link: boolean;
    table: boolean;
  }

  /** Check if cursor is between a pair of identical markers like ** or ~~ */
  const inPair = (line: string, col: number, marker: string): boolean => {
    const pos: number[] = [];
    for (let i = 0; i <= line.length - marker.length; i++) {
      if (line.slice(i, i + marker.length) === marker) pos.push(i);
    }
    for (let i = 0; i + 1 < pos.length; i += 2) {
      if (pos[i] + marker.length <= col && col <= pos[i + 1]) return true;
    }
    return false;
  };

  /** Like inPair but skips doubled markers (* skips **, ` skips ``) */
  const inSingle = (line: string, col: number, ch: string): boolean => {
    const dbl = ch + ch;
    const pos: number[] = [];
    for (let i = 0; i < line.length; i++) {
      if (line.slice(i, i + dbl.length) === dbl) {
        i += dbl.length - 1;
        continue;
      }
      if (line[i] === ch) pos.push(i);
    }
    for (let i = 0; i + 1 < pos.length; i += 2) {
      if (pos[i] + 1 <= col && col <= pos[i + 1]) return true;
    }
    return false;
  };

  const inLink = (line: string, col: number): boolean => {
    const bs = line.lastIndexOf("[", col);
    if (bs === -1) return false;
    const be = line.indexOf("](", bs + 1);
    if (be === -1) return false;
    const pe = line.indexOf(")", be + 2);
    if (pe === -1) return false;
    return col > bs && col <= pe;
  };

  const detectList = (line: string): ListType => {
    if (/^[\t ]*-\s\[.\]\s/.test(line)) return "task";
    if (/^[\t ]*(-|\*)\s/.test(line)) return "unordered";
    if (/^[\t ]*\d+\.\s/.test(line)) return "ordered";
    return "none";
  };

  const detectTable = (content: string, cursor: number): boolean => {
    // Walk up from cursor to find the table header/separator or a blank line
    let ln = cursor;
    // Find start of current line
    while (ln > 0 && content[ln - 1] !== "\n" && content[ln - 1] !== "\r") ln--;
    // Check if this line looks like a table row
    const lineEnd = content.indexOf("\n", ln);
    const line =
      lineEnd === -1 ? content.slice(ln) : content.slice(ln, lineEnd);
    if (!/\|/.test(line)) return false;
    // Walk up to find separator line (|---|...|)
    let pos = ln - 1;
    while (pos > 0 && content[pos] === "\r") pos--;
    if (pos <= 0) return false;
    // Go to previous line
    let prevEnd = pos;
    while (
      prevEnd > 0 &&
      (content[prevEnd] === "\n" || content[prevEnd] === "\r")
    )
      prevEnd--;
    let prevStart = prevEnd;
    while (
      prevStart > 0 &&
      content[prevStart - 1] !== "\n" &&
      content[prevStart - 1] !== "\r"
    )
      prevStart--;
    const prevLine = content.slice(prevStart, prevEnd + 1);
    // Check if it's a separator (|---|...|) or a table row with separator above
    return /\|[\s\-:]+\|/.test(prevLine) || /\|[\s\-:]+\|/.test(line);
  };

  const getFormat = (): FormatState => {
    const e = ed();
    if (!e)
      return {
        bold: false,
        italic: false,
        strike: false,
        icode: false,
        list: "none",
        quote: false,
        link: false,
        table: false,
      };
    const content = e.getContent();
    const sel = e.getSelection();
    const col = sel.start;
    // Find current line
    let a = col - 1;
    while (a >= 0 && content[a] !== "\n" && content[a] !== "\r") a--;
    const ls = a + 1;
    let b = col;
    while (b < content.length && content[b] !== "\n" && content[b] !== "\r")
      b++;
    const line = content.slice(ls, b);
    const c = col - ls;
    return {
      bold: inPair(line, c, "**"),
      italic: inSingle(line, c, "*"),
      strike: inPair(line, c, "~~"),
      icode: inSingle(line, c, "`"),
      list: detectList(line),
      quote: /^>\s/.test(line),
      link: inLink(line, c),
      table: detectTable(content, col),
    };
  };

  /* ── wrap: surround selection ── */
  const wrap = (before: string, after: string) => {
    const e = ed();
    if (!e) return;
    const sel = e.getSelection();
    e.replaceSelection(before + sel.text + after);
    e.focus();
  };

  /* ── mLines: prefix each selected line ── */
  const mLines = (prefix: string) => {
    const e = ed();
    if (!e) return;
    const sel = e.getSelection();
    const hasSelection = sel.start !== sel.end;
    if (hasSelection) {
      const lines = sel.text.split("\n");
      const prefixed = lines.map((l) => prefix + l).join("\n");
      e.replaceSelection(prefixed);
    } else {
      e.replaceSelection(prefix);
    }
    e.focus();
  };

  /* ── Common click handlers ── */
  const bold = () => wrap("**", "**");
  const italic = () => wrap("*", "*");
  const strike = () => wrap("~~", "~~");
  const icode = () => wrap("`", "`");
  const heading = (level: number) => {
    mLines("#".repeat(level) + " ");
    setHeadingOpen(false);
  };
  const quote = () => {
    mLines("> ");
  };
  const ulist = () => {
    mLines("- ");
    setListOpen(false);
  };
  const olist = () => {
    mLines("1. ");
    setListOpen(false);
  };
  const task = () => {
    mLines("- [ ] ");
    setListOpen(false);
  };
  const hr = () => {
    const e = ed();
    e?.replaceSelection("\n---\n");
    e?.focus();
  };

  const table = () => {
    const e = ed();
    if (!e) return;
    e.replaceSelection(
      "\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n|     |     |     |\n",
    );
    e.focus();
  };

  const link = () => {
    const e = ed();
    if (!e) return;
    const sel = e.getSelection();
    const linkText = sel.text || "文字";
    const md = `[${linkText}](url)`;
    const beforeLen = sel.start;
    e.replaceSelection(md);
    // Select "url" so user can type to replace
    const urlStart = beforeLen + linkText.length + 3; // after `[text](`
    const urlEnd = urlStart + 3; // "url".length = 3
    e.selectRange(urlStart, urlEnd);
  };

  const codeBlock = (lang?: string) => {
    const e = ed();
    if (!e) return;
    const langTag = lang ? lang : "";
    const sel = e.getSelection();
    const block = sel.text
      ? `\n\`\`\`${langTag}\n${sel.text}\n\`\`\`\n`
      : `\n\`\`\`${langTag}\n\n\`\`\`\n`;
    e.replaceSelection(block);
    setCodeOpen(false);
    e.focus();
  };

  /* ── Separator ── */
  const Sep = () => <span className="md-sep" />;

  /* ── Render ── */
  const fmt = getFormat();
  const hLevel = getHeadingLevel();
  const HeadingIcon = hLevel > 0 ? headingIcons[hLevel - 1] : IconHeading1;

  return (
    <>
      {/* 块级：标题▾ */}
      <Dropdown
        title="标题"
        icon={<HeadingIcon />}
        open={headingOpen}
        onToggle={() => setHeadingOpen(!headingOpen)}
        active={hLevel > 0 ? "heading" : false}
        disabled={disabled}
      >
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <DropdownItem key={n} onClick={() => heading(n)}>
            H{n} 标题
          </DropdownItem>
        ))}
      </Dropdown>

      {/* 行内：B I S̶ <> */}
      <Btn title="加粗" onClick={bold} active={fmt.bold} disabled={disabled}>
        <IconBold />
      </Btn>
      <Btn
        title="斜体"
        onClick={italic}
        active={fmt.italic}
        disabled={disabled}
      >
        <IconItalic />
      </Btn>
      <Btn
        title="删除线"
        onClick={strike}
        active={fmt.strike}
        disabled={disabled}
      >
        <IconStrikethrough />
      </Btn>
      <Btn
        title="行内代码"
        onClick={icode}
        active={fmt.icode}
        disabled={disabled}
      >
        <IconCode />
      </Btn>
      <Sep />

      {/* 块级前缀：列表▾ 引用 */}
      <Dropdown
        title="列表"
        icon={<IconList />}
        open={listOpen}
        onToggle={() => setListOpen(!listOpen)}
        active={fmt.list !== "none"}
        disabled={disabled}
      >
        <DropdownItem onClick={ulist}>无序列表</DropdownItem>
        <DropdownItem onClick={olist}>有序列表</DropdownItem>
        <DropdownItem onClick={task}>任务列表</DropdownItem>
      </Dropdown>
      <Btn title="引用" onClick={quote} active={fmt.quote} disabled={disabled}>
        <IconQuote />
      </Btn>
      <Sep />

      {/* 插入：链接 图片 代码▾ */}
      <Btn title="链接" onClick={link} active={fmt.link} disabled={disabled}>
        <IconLink />
      </Btn>
      <Btn
        title="图片"
        onClick={onInsertImage ?? (() => {})}
        disabled={disabled}
      >
        <IconImage />
      </Btn>
      <Dropdown
        title="代码"
        icon={<IconCode />}
        open={codeOpen}
        onToggle={() => setCodeOpen(!codeOpen)}
        disabled={disabled}
      >
        <DropdownItem onClick={() => codeBlock()}>代码块（普通文本）</DropdownItem>
        <DropdownItem onClick={() => codeBlock("js")}>JavaScript</DropdownItem>
        <DropdownItem onClick={() => codeBlock("ts")}>TypeScript</DropdownItem>
        <DropdownItem onClick={() => codeBlock("py")}>Python</DropdownItem>
        <DropdownItem onClick={() => codeBlock("rs")}>Rust</DropdownItem>
        <DropdownItem onClick={() => codeBlock("json")}>JSON</DropdownItem>
        <DropdownItem onClick={() => codeBlock("bash")}>Bash</DropdownItem>
        <DropdownItem onClick={() => codeBlock("md")}>Markdown</DropdownItem>
      </Dropdown>
      <Sep />

      <Dropdown
        title="更多操作"
        icon={
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
          </svg>
        }
        open={moreOpen}
        onToggle={() => setMoreOpen(!moreOpen)}
        disabled={disabled}
      >
        <DropdownItem
          onClick={() => {
            table();
            setMoreOpen(false);
          }}
        >
          <IconTable /> 表格
        </DropdownItem>
        <DropdownItem
          onClick={() => {
            hr();
            setMoreOpen(false);
          }}
        >
          <IconHr /> 分割线
        </DropdownItem>
        <DropdownItem
          onClick={() => {
            ed()?.focus();
            document.execCommand("undo");
            setMoreOpen(false);
          }}
        >
          <IconUndo /> 撤销
        </DropdownItem>
        <DropdownItem
          onClick={() => {
            ed()?.focus();
            document.execCommand("redo");
            setMoreOpen(false);
          }}
        >
          <IconRedo /> 重做
        </DropdownItem>
      </Dropdown>
    </>
  );
}

export default memo(MdToolbar);
