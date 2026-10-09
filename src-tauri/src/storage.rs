//! 文件存储边界。测试显式传入目录，不依赖进程全局环境变量。
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
};

pub type Tags = HashMap<String, Vec<String>>;
const INITIAL_DOCUMENTS: [(&str, &[u8]); 2] = [
    ("SOUL.md", include_bytes!("../../WELCOME_CONTENT.md")),
    (
        "Markdown 语法指南.md",
        include_bytes!("../../MD_GUIDE_CONTENT.md"),
    ),
];
#[derive(Clone)]
pub struct Store {
    pub notes: PathBuf,
    pub root: PathBuf,
}
#[derive(Serialize, Deserialize, Clone)]
pub struct NoteInfo {
    pub file_name: String,
    pub modified: u64,
    pub size: u64,
    pub tags: Vec<String>,
}
#[derive(Serialize)]
pub struct SearchHit {
    #[serde(flatten)]
    pub note: NoteInfo,
    pub snippet: Option<String>,
    #[serde(rename = "matchStart")]
    pub match_start: Option<usize>,
    #[serde(rename = "matchLength")]
    pub match_length: Option<usize>,
}

pub fn valid_name(name: &str) -> Result<(), String> {
    let stem = name.strip_suffix(".md").ok_or("文件名必须以 .md 结尾")?;
    let reserved = stem.split('.').next().unwrap_or("").to_ascii_uppercase();
    if stem.is_empty()
        || name.encode_utf16().count() > 220
        || stem.ends_with([' ', '.'])
        || name
            .chars()
            .any(|c| c.is_control() || "\\/:*?\"<>|".contains(c))
        || [
            "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
            "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
        ]
        .contains(&reserved.as_str())
    {
        return Err("请使用有效的便利贴名称，不要包含路径或系统保留名称".into());
    }
    Ok(())
}
fn reject_link(path: &Path) -> Result<(), String> {
    if let Ok(meta) = fs::symlink_metadata(path) {
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x400 != 0 {
                return Err("不允许通过链接访问档案文件".into());
            }
        }
        if meta.file_type().is_symlink() {
            return Err("不允许通过链接访问档案文件".into());
        }
    }
    Ok(())
}
/// 同目录临时文件 + 同步 + 原子替换。失败时原文件仍完整。
pub fn atomic_write(path: &Path, content: &[u8]) -> Result<(), String> {
    reject_link(path)?;
    let parent = path.parent().ok_or("文件路径无效")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    temp.write_all(content).map_err(|e| e.to_string())?;
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    temp.persist(path)
        .map_err(|e| format!("写入失败，原内容已保留：{}", e.error))?;
    Ok(())
}
fn json_read<T: serde::de::DeserializeOwned + Default>(path: &Path) -> Result<T, String> {
    reject_link(path)?;
    match fs::read(path) {
        Ok(bytes) => {
            serde_json::from_slice(&bytes).map_err(|e| format!("数据文件损坏，原文件未改动：{e}"))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(T::default()),
        Err(e) => Err(e.to_string()),
    }
}
impl Store {
    pub fn new(notes: PathBuf, root: PathBuf) -> Self {
        Self { notes, root }
    }
    pub fn seed_initial_documents(&self) -> Result<(), String> {
        let marker = self.root.join(".initial-documents-v1.json");
        match fs::symlink_metadata(&marker) {
            Ok(_) => return Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
        if !self.notes.is_absolute() {
            return Err("初始文档目录必须是绝对路径".into());
        }
        fs::create_dir_all(&self.notes).map_err(|e| e.to_string())?;
        for (name, content) in INITIAL_DOCUMENTS {
            valid_name(name)?;
            let destination = self.notes.join(name);
            match fs::symlink_metadata(&destination) {
                Ok(_) => continue,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.to_string()),
            }
            // 完整写入临时文件后排他创建，保留原文件、并发新建及用户自定义版本。
            let mut temp =
                tempfile::NamedTempFile::new_in(&self.notes).map_err(|e| e.to_string())?;
            temp.write_all(content).map_err(|e| e.to_string())?;
            temp.as_file().sync_all().map_err(|e| e.to_string())?;
            match temp.persist_noclobber(destination) {
                Ok(_) => {}
                Err(e) if e.error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(e) => return Err(format!("创建初始文档失败：{}", e.error)),
            }
        }
        // 完成后才标记；用户以后删除默认文档，不在重启时重新生成。
        atomic_write(&marker, b"{\"version\":1}")
    }
    pub fn path(&self, name: &str) -> Result<PathBuf, String> {
        valid_name(name)?;
        let p = self.notes.join(name);
        reject_link(&p)?;
        Ok(p)
    }
    pub fn load(&self, name: &str) -> Result<String, String> {
        fs::read_to_string(self.path(name)?).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                "NOT_FOUND".into()
            } else {
                e.to_string()
            }
        })
    }
    pub fn save(&self, name: &str, content: &str) -> Result<(), String> {
        let p = self.path(name)?;
        // 已存在的正文保留上一版，恢复文件不进入便利贴列表。
        if p.exists() {
            let previous = fs::read(&p).map_err(|e| e.to_string())?;
            if previous == content.as_bytes() {
                return Ok(());
            }
            atomic_write(&self.root.join(".recovery/notes").join(name), &previous)?;
        }
        atomic_write(&p, content.as_bytes())
    }
    pub fn save_checked(&self, name: &str, content: &str, expected: &str) -> Result<(), String> {
        if self.load(name)? != expected {
            return Err("磁盘内容已被外部修改，当前稿保留；请先导出或确认冲突".into());
        }
        self.save(name, content)
    }
    pub fn save_buffer_checked(&self, content: &str, expected: &str) -> Result<(), String> {
        if self.buffer()?.unwrap_or_default() != expected {
            return Err("草稿文件被外部修改，当前稿保留".into());
        }
        self.save_buffer(content)
    }
    pub fn create(&self, name: &str, content: &str) -> Result<String, String> {
        valid_name(name)?;
        fs::create_dir_all(&self.notes).map_err(|e| e.to_string())?;
        let stem = name.strip_suffix(".md").unwrap();
        for i in 0..10000 {
            let candidate = if i == 0 {
                name.into()
            } else {
                format!("{stem}-{i}.md")
            };
            let path = self.path(&candidate)?;
            let mut temp =
                tempfile::NamedTempFile::new_in(&self.notes).map_err(|e| e.to_string())?;
            temp.write_all(content.as_bytes())
                .map_err(|e| e.to_string())?;
            temp.as_file().sync_all().map_err(|e| e.to_string())?;
            match temp.persist_noclobber(&path) {
                Ok(_) => return Ok(candidate),
                Err(e) if e.error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(e.error.to_string()),
            }
        }
        Err("同名便利贴过多，请换一个名称".into())
    }
    pub fn tags(&self) -> Result<Tags, String> {
        json_read(&self.notes.join("tags.json"))
    }
    pub fn write_tags(&self, tags: &Tags) -> Result<(), String> {
        atomic_write(
            &self.notes.join("tags.json"),
            &serde_json::to_vec_pretty(tags).map_err(|e| e.to_string())?,
        )
    }
    pub fn set_tags(&self, name: &str, tags: Vec<String>) -> Result<(), String> {
        self.load(name)?;
        let mut db = self.tags()?;
        let mut tags: Vec<_> = tags
            .into_iter()
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty())
            .collect();
        tags.sort();
        tags.dedup();
        if tags.is_empty() {
            db.remove(name);
        } else {
            db.insert(name.into(), tags);
        }
        self.write_tags(&db)
    }
    pub fn rename(&self, old: &str, new: &str) -> Result<(), String> {
        let old_path = self.path(old)?;
        let new_path = self.path(new)?;
        if old == new {
            return Ok(());
        }
        if new_path.exists() {
            return Err("目标名称已存在".into());
        }
        let mut db = self.tags()?;
        let old_db = db.clone();
        let text = self.load(old)?;
        let created = self.create(new, &text)?;
        if created != new {
            fs::remove_file(self.path(&created)?).map_err(|e| e.to_string())?;
            return Err("目标名称已存在".into());
        }
        if let Some(tags) = db.remove(old) {
            db.insert(new.into(), tags);
        }
        if let Err(e) = self.write_tags(&db) {
            let _ = fs::remove_file(&new_path);
            return Err(e);
        }
        if let Err(e) = fs::remove_file(&old_path) {
            let _ = self.write_tags(&old_db);
            let _ = fs::remove_file(new_path);
            return Err(e.to_string());
        }
        Ok(())
    }
    pub fn delete(&self, name: &str) -> Result<(), String> {
        self.delete_with(name, crate::recycle::move_to_system_bin)
    }
    fn delete_with(
        &self,
        name: &str,
        recycle: impl FnOnce(&Path) -> Result<(), String>,
    ) -> Result<(), String> {
        let source = self.path(name)?;
        if !source.is_absolute() || !fs::metadata(&source).map_err(|e| e.to_string())?.is_file() {
            return Err("只允许将有效的便利贴文件移入系统回收站".into());
        }
        let mut db = self.tags()?;
        let old_db = db.clone();
        db.remove(name);
        self.write_tags(&db)?;
        if let Err(e) = recycle(&source) {
            if let Err(restore_error) = self.write_tags(&old_db) {
                return Err(format!("{e}；标签索引恢复失败：{restore_error}"));
            }
            return Err(e);
        }
        Ok(())
    }
    pub fn list(&self) -> Result<Vec<NoteInfo>, String> {
        fs::create_dir_all(&self.notes).map_err(|e| e.to_string())?;
        let db = self.tags()?;
        let mut result = Vec::new();
        for entry in fs::read_dir(&self.notes).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name().to_string_lossy().to_string();
            if valid_name(&name).is_err()
                || !entry.file_type().map_err(|e| e.to_string())?.is_file()
            {
                continue;
            }
            self.path(&name)?;
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            let modified = meta
                .modified()
                .map_err(|e| e.to_string())?
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|e| e.to_string())?
                .as_secs();
            result.push(NoteInfo {
                tags: db.get(&name).cloned().unwrap_or_default(),
                file_name: name,
                modified,
                size: meta.len(),
            });
        }
        result.sort_by(|a, b| {
            b.modified
                .cmp(&a.modified)
                .then(a.file_name.cmp(&b.file_name))
        });
        Ok(result)
    }
    pub fn buffer_path(&self) -> PathBuf {
        self.root.join(".float-buffer/buffer.md")
    }
    pub fn search(&self, query: &str) -> Result<Vec<SearchHit>, String> {
        let q = query.trim().to_lowercase();
        let mut hits = Vec::new();
        for note in self.list()? {
            let content = self.load(&note.file_name)?;
            let lower = content.to_lowercase();
            let found = lower.find(&q);
            if found.is_none() && !note.file_name.to_lowercase().contains(&q) {
                continue;
            }
            let (snippet, start, length) = if let Some(byte) = found {
                let index = lower[..byte].chars().count();
                let chars: Vec<char> = content.chars().collect();
                let begin = index.saturating_sub(40).min(chars.len());
                let end = (index + q.chars().count() + 40).min(chars.len());
                let snippet: String = chars[begin..end].iter().collect();
                let start: usize = chars[begin..index.min(chars.len())]
                    .iter()
                    .map(|c| c.len_utf16())
                    .sum();
                (Some(snippet), Some(start), Some(q.encode_utf16().count()))
            } else {
                (None, None, None)
            };
            hits.push(SearchHit {
                note,
                snippet,
                match_start: start,
                match_length: length,
            });
        }
        Ok(hits)
    }
    pub fn buffer(&self) -> Result<Option<String>, String> {
        let p = self.buffer_path();
        reject_link(&p)?;
        match fs::read_to_string(p) {
            Ok(s) => Ok(Some(s)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    pub fn save_buffer(&self, text: &str) -> Result<(), String> {
        reject_link(&self.buffer_path())?;
        if self.buffer_path().exists() {
            let previous = fs::read(self.buffer_path()).map_err(|e| e.to_string())?;
            if previous == text.as_bytes() {
                return Ok(());
            }
            atomic_write(&self.root.join(".recovery/buffer.md"), &previous)?;
        }
        atomic_write(&self.buffer_path(), text.as_bytes())
    }
    pub fn archive(&self, title: &str) -> Result<String, String> {
        let text = self
            .buffer()?
            .filter(|s| !s.trim().is_empty())
            .ok_or("EMPTY_BUFFER")?;
        let name = self.create(title, &text)?;
        if let Err(e) = self.save_buffer("") {
            let _ = fs::remove_file(self.path(&name)?);
            return Err(e);
        }
        Ok(name)
    }
    /// 迁移采用复制，不删除旧目录，所有原始正文都保留。
    pub fn copy_to(&self, destination: &Path) -> Result<HashMap<String, String>, String> {
        fs::create_dir_all(destination).map_err(|e| e.to_string())?;
        let old = fs::canonicalize(&self.notes).map_err(|e| e.to_string())?;
        let new = fs::canonicalize(destination).map_err(|e| e.to_string())?;
        if old == new {
            return Ok(HashMap::new());
        }
        if new.starts_with(&old) || old.starts_with(&new) {
            return Err("新旧存档目录不能互相包含".into());
        }
        let target = Store::new(new, self.root.clone());
        let source_tags = self.tags()?;
        let mut merged = target.tags()?;
        let mut created = Vec::new();
        let mut copied_assets = Vec::new();
        let mut names = HashMap::new();
        let copy_result = (|| {
            let assets = self.notes.join(".assets");
            if assets.is_dir() {
                reject_link(&assets)?;
                for entry in fs::read_dir(&assets).map_err(|e| e.to_string())? {
                    let entry = entry.map_err(|e| e.to_string())?;
                    reject_link(&entry.path())?;
                    if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
                        return Err("图片目录包含非文件项，请先检查".into());
                    }
                    let data = fs::read(entry.path()).map_err(|e| e.to_string())?;
                    let path = target.notes.join(".assets").join(entry.file_name());
                    reject_link(&path)?;
                    if path.exists() {
                        if fs::read(&path).map_err(|e| e.to_string())? != data {
                            return Err("目标目录存在不同内容的同名图片，原目录已保留".into());
                        }
                    } else {
                        atomic_write(&path, &data)?;
                        copied_assets.push(path);
                    }
                }
            }
            for note in self.list()? {
                let name = target.create(&note.file_name, &self.load(&note.file_name)?)?;
                created.push(name.clone());
                let modified = fs::metadata(self.path(&note.file_name)?)
                    .map_err(|e| e.to_string())?
                    .modified()
                    .map_err(|e| e.to_string())?;
                fs::OpenOptions::new()
                    .write(true)
                    .open(target.path(&name)?)
                    .map_err(|e| e.to_string())?
                    .set_times(fs::FileTimes::new().set_modified(modified))
                    .map_err(|e| e.to_string())?;
                names.insert(note.file_name.clone(), name.clone());
                if let Some(tags) = source_tags.get(&note.file_name) {
                    merged.insert(name, tags.clone());
                }
            }
            target.write_tags(&merged)?;
            Ok(names)
        })();
        if copy_result.is_err() {
            for name in created {
                if let Ok(p) = target.path(&name) {
                    let _ = fs::remove_file(p);
                }
            }
            for p in copied_assets {
                let _ = fs::remove_file(p);
            }
        }
        copy_result
    }
    pub fn import_image(&self, path: &Path) -> Result<String, String> {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !["png", "jpg", "jpeg", "gif", "webp"].contains(&ext.as_str()) {
            return Err("请选择 PNG、JPEG、GIF 或 WebP 图片".into());
        }
        if fs::metadata(path).map_err(|e| e.to_string())?.len() > 16 * 1024 * 1024 {
            return Err("图片超过 16 MB".into());
        }
        let name = format!(
            "image-{}.{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0),
            ext
        );
        let relative = format!(".assets/{name}");
        atomic_write(
            &self.notes.join(&relative),
            &fs::read(path).map_err(|e| e.to_string())?,
        )?;
        Ok(relative)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, Store) {
        let t = tempfile::tempdir().unwrap();
        let s = Store::new(t.path().join("notes"), t.path().join("data"));
        (t, s)
    }
    #[test]
    fn first_run_creates_exact_templates_once() {
        let (_t, s) = fixture();
        s.seed_initial_documents().unwrap();
        assert_eq!(s.list().unwrap().len(), 2);
        for (name, bytes) in INITIAL_DOCUMENTS {
            assert_eq!(fs::read(s.notes.join(name)).unwrap(), bytes);
        }
        fs::remove_file(s.notes.join("SOUL.md")).unwrap();
        s.seed_initial_documents().unwrap();
        assert!(!s.notes.join("SOUL.md").exists());
    }
    #[test]
    fn existing_initial_document_is_never_overwritten() {
        let (_t, s) = fixture();
        s.create("SOUL.md", "USER CUSTOM SOUL").unwrap();
        s.set_tags("SOUL.md", vec!["custom".into()]).unwrap();
        s.seed_initial_documents().unwrap();
        assert_eq!(s.load("SOUL.md").unwrap(), "USER CUSTOM SOUL");
        assert_eq!(s.tags().unwrap()["SOUL.md"], vec!["custom"]);
        assert!(s.notes.join("Markdown 语法指南.md").exists());
        assert!(!s.notes.join("SOUL-1.md").exists());
    }
    #[test]
    #[ignore = "仅用于显式本地规模测量"]
    fn benchmark_archive_search_sizes() {
        for count in [100, 1000, 5000] {
            let (_temp, store) = fixture();
            fs::create_dir_all(&store.notes).unwrap();
            for i in 0..count {
                fs::write(
                    store.notes.join(format!("fixture-{i:05}.md")),
                    format!(
                        "# 隔离样例 {i}\n{}\nneedle\n",
                        "一段便于搜索的测试内容。".repeat(80)
                    ),
                )
                .unwrap();
            }
            let started = std::time::Instant::now();
            let hits = store.search("needle").unwrap();
            let ms = started.elapsed().as_millis();
            assert_eq!(hits.len(), count);
            println!(
                "SEARCH_BENCH count={count} elapsed_ms={ms} hits={}",
                hits.len()
            );
        }
    }
    #[test]
    fn path_boundaries() {
        let (_t, s) = fixture();
        for name in [
            "../escape.md",
            "..\\escape.md",
            "C:\\escape.md",
            "CON.md",
            "folder/a.md",
            "name. .md",
        ] {
            assert!(s.save(name, "x").is_err(), "{name}");
        }
    }
    #[test]
    fn collision_keeps_original() {
        let (_t, s) = fixture();
        assert_eq!(s.create("想法.md", "first").unwrap(), "想法.md");
        assert_eq!(s.create("想法.md", "").unwrap(), "想法-1.md");
        assert_eq!(s.load("想法.md").unwrap(), "first");
    }
    #[test]
    fn missing_is_an_error() {
        let (_t, s) = fixture();
        assert_eq!(s.load("missing.md").unwrap_err(), "NOT_FOUND");
    }
    #[test]
    fn external_edit_is_not_silently_overwritten() {
        let (_t, s) = fixture();
        s.create("a.md", "original").unwrap();
        fs::write(s.path("a.md").unwrap(), "external edit").unwrap();
        assert!(s.save_checked("a.md", "my edit", "original").is_err());
        assert_eq!(s.load("a.md").unwrap(), "external edit");
    }
    #[test]
    fn save_keeps_recoverable_previous_version() {
        let (_t, s) = fixture();
        s.save("a.md", "old").unwrap();
        s.save("a.md", "new").unwrap();
        assert_eq!(s.load("a.md").unwrap(), "new");
        assert_eq!(
            fs::read_to_string(s.root.join(".recovery/notes/a.md")).unwrap(),
            "old"
        );
    }
    #[test]
    fn rename_keeps_tags() {
        let (_t, s) = fixture();
        s.create("a.md", "text").unwrap();
        s.set_tags("a.md", vec!["tag".into()]).unwrap();
        s.rename("a.md", "b.md").unwrap();
        assert!(!s.tags().unwrap().contains_key("a.md"));
        assert_eq!(s.tags().unwrap()["b.md"], vec!["tag"]);
    }
    #[test]
    fn recycle_failure_keeps_document_and_tags() {
        let (_t, s) = fixture();
        s.create("keep.md", "original").unwrap();
        s.set_tags("keep.md", vec!["tag".into()]).unwrap();
        assert!(s
            .delete_with("keep.md", |_| Err("recycle unavailable".into()))
            .is_err());
        assert_eq!(s.load("keep.md").unwrap(), "original");
        assert_eq!(s.tags().unwrap()["keep.md"], vec!["tag"]);
        assert!(!s.root.join(".trash").exists());
    }
    #[test]
    fn recycling_cleans_index_without_private_trash() {
        let (t, s) = fixture();
        s.create("note.md", "recyclable").unwrap();
        s.set_tags("note.md", vec!["tag".into()]).unwrap();
        let recycled = t.path().join("fake-system-recycled.md");
        s.delete_with("note.md", |path| {
            fs::rename(path, &recycled).map_err(|e| e.to_string())
        })
        .unwrap();
        assert_eq!(fs::read_to_string(recycled).unwrap(), "recyclable");
        assert!(s.load("note.md").is_err());
        assert!(!s.tags().unwrap().contains_key("note.md"));
        assert!(!s.root.join(".trash").exists());
    }
    #[cfg(windows)]
    #[test]
    #[ignore = "显式运行：只将工作区生成的隔离样例送入 Windows 系统回收站"]
    fn windows_recycle_isolated_fixture() {
        let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .canonicalize()
            .unwrap();
        let scratch = workspace.join(".scratch/system-recycle-validation");
        fs::create_dir_all(&scratch).unwrap();
        let scratch = scratch.canonicalize().unwrap();
        assert!(scratch.starts_with(&workspace));
        let t = tempfile::Builder::new()
            .prefix("recycle-check-")
            .tempdir_in(&scratch)
            .unwrap();
        assert!(t.path().canonicalize().unwrap().starts_with(&scratch));
        let s = Store::new(t.path().join("notes"), t.path().join("data"));
        let name = format!(
            "QuickMD-system-recycle-test-{}.md",
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        );
        s.create(&name, "ISOLATED QUICKMD RECYCLE TEST").unwrap();
        s.set_tags(&name, vec!["test-only".into()]).unwrap();
        s.delete(&name).unwrap();
        assert!(!s.path(&name).unwrap().exists());
        assert!(!s.tags().unwrap().contains_key(&name));
        assert!(!s.root.join(".trash").exists());
        println!("SYSTEM_RECYCLE_CONFIRMED fixture={name}");
    }
    #[test]
    fn archive_only_clears_after_success() {
        let (_t, s) = fixture();
        s.save_buffer("draft").unwrap();
        assert!(s.archive("../bad.md").is_err());
        assert_eq!(s.buffer().unwrap().unwrap(), "draft");
        assert_eq!(s.archive("draft.md").unwrap(), "draft.md");
        assert_eq!(s.load("draft.md").unwrap(), "draft");
        assert_eq!(s.buffer().unwrap().unwrap(), "");
    }
    #[test]
    fn migration_preserves_originals_and_resolves_conflicts() {
        let (t, s) = fixture();
        s.create("a.md", "source").unwrap();
        fs::OpenOptions::new()
            .write(true)
            .open(s.path("a.md").unwrap())
            .unwrap()
            .set_times(
                fs::FileTimes::new()
                    .set_modified(std::time::UNIX_EPOCH + std::time::Duration::from_secs(100)),
            )
            .unwrap();
        s.set_tags("a.md", vec!["source-tag".into()]).unwrap();
        let dest = Store::new(t.path().join("destination"), s.root.clone());
        dest.create("a.md", "existing").unwrap();
        s.copy_to(&dest.notes).unwrap();
        assert_eq!(s.load("a.md").unwrap(), "source");
        assert_eq!(dest.load("a.md").unwrap(), "existing");
        assert_eq!(dest.load("a-1.md").unwrap(), "source");
        assert_eq!(
            fs::metadata(dest.path("a-1.md").unwrap())
                .unwrap()
                .modified()
                .unwrap()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            100
        );
        assert_eq!(dest.tags().unwrap()["a-1.md"], vec!["source-tag"]);
    }
    #[test]
    fn corrupt_tags_cannot_be_silently_overwritten() {
        let (_t, s) = fixture();
        s.create("a.md", "x").unwrap();
        fs::write(s.notes.join("tags.json"), "broken").unwrap();
        assert!(s.set_tags("a.md", vec![]).is_err());
        assert_eq!(
            fs::read_to_string(s.notes.join("tags.json")).unwrap(),
            "broken"
        );
    }
    #[test]
    fn concurrent_creation_never_overwrites() {
        let (_t, s) = fixture();
        let handles: Vec<_> = (0..12)
            .map(|i| {
                let s = s.clone();
                std::thread::spawn(move || s.create("same.md", &i.to_string()).unwrap())
            })
            .collect();
        let names: std::collections::HashSet<_> =
            handles.into_iter().map(|h| h.join().unwrap()).collect();
        assert_eq!(names.len(), 12);
        assert_eq!(s.list().unwrap().len(), 12);
    }
    #[test]
    fn search_finds_body_and_unicode_snippets() {
        let (_t, s) = fixture();
        s.create("名字.md", "前文🌱找到想法再行动").unwrap();
        let hits = s.search("想法").unwrap();
        assert_eq!(hits.len(), 1);
        let text = hits[0].snippet.as_ref().unwrap();
        assert!(text.contains("想法"));
        assert_eq!(hits[0].match_length, Some(2));
        assert_eq!(s.search("名字").unwrap().len(), 1);
    }
    #[test]
    fn images_travel_with_archive_without_changing_source() {
        let (t, s) = fixture();
        let image = t.path().join("original.png");
        fs::write(&image, b"isolated image").unwrap();
        let relative = s.import_image(&image).unwrap();
        s.create("image.md", &format!("![image]({relative})"))
            .unwrap();
        let dest = t.path().join("destination");
        s.copy_to(&dest).unwrap();
        assert_eq!(fs::read(dest.join(&relative)).unwrap(), b"isolated image");
        assert_eq!(fs::read(image).unwrap(), b"isolated image");
    }
}
