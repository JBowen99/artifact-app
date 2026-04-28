import type { FileMetadata } from "./api-types";
import {
  File,
  FileText,
  FileImage,
  BoxIcon,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode2,
  FileSpreadsheet,
  FileQuestion,
  Folder,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";

export type TreeNodeType = "folder" | "file";

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  type: TreeNodeType;
  metadata?: FileMetadata;
  children?: TreeNode[];
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"]);
const CAD_EXTS = new Set(["step", "stp", "stl", "obj", "iges", "igs", "3mf", "prt", "asm", "sldprt", "sldasm"]);
const VIDEO_EXTS = new Set(["mp4", "mov", "avi", "mkv", "webm"]);
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "flac", "aac"]);
const ARCHIVE_EXTS = new Set(["zip", "tar", "gz", "bz2", "xz", "7z", "rar"]);
const CODE_EXTS = new Set(["js", "ts", "tsx", "jsx", "py", "go", "rs", "java", "c", "cpp", "h", "hpp", "rb", "php", "swift", "kt", "sh", "bash", "zsh"]);
const TEXT_EXTS = new Set(["txt", "md", "json", "yaml", "yml", "toml", "xml", "html", "css", "scss", "less", "ini", "cfg", "conf", "env", "log"]);
const SPREADSHEET_EXTS = new Set(["csv", "xlsx", "xls", "tsv"]);
const PDF_EXT = "pdf";

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot === -1 || dot === fileName.length - 1) return "";
  return fileName.slice(dot + 1).toLowerCase();
}

export function getFileIcon(fileName: string): LucideIcon {
  const ext = getExtension(fileName);
  if (IMAGE_EXTS.has(ext)) return FileImage;
  if (CAD_EXTS.has(ext)) return BoxIcon;
  if (VIDEO_EXTS.has(ext)) return FileVideo;
  if (AUDIO_EXTS.has(ext)) return FileAudio;
  if (ARCHIVE_EXTS.has(ext)) return FileArchive;
  if (CODE_EXTS.has(ext)) return FileCode2;
  if (SPREADSHEET_EXTS.has(ext)) return FileSpreadsheet;
  if (ext === PDF_EXT) return File;
  if (TEXT_EXTS.has(ext)) return FileText;
  return FileQuestion;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);
  return `${size % 1 === 0 ? size : size.toFixed(1)} ${units[i]}`;
}

export function buildChildNodes(
  files: FileMetadata[],
  parentPath: string,
): TreeNode[] {
  const depth = parentPath === "/" ? 1 : parentPath.split("/").filter(Boolean).length + 1;

  const folderNames = new Set<string>();
  const fileNodes: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    if (parts.length < depth) continue;

    if (parts.length === depth) {
      if (file.file_name === ".artifact-folder") {
        folderNames.add(parts[depth - 1]);
      } else {
        fileNodes.push({
          id: file.id,
          name: file.file_name,
          path: file.path,
          type: "file",
          metadata: file,
        });
      }
    } else if (parts.length > depth) {
      folderNames.add(parts[depth - 1]);
    }
  }

  const folderNodes: TreeNode[] = [...folderNames].map((name) => {
    const folderPath = parentPath === "/" ? "/" + name : parentPath + "/" + name;
    return {
      id: `folder-${folderPath}`,
      name,
      path: folderPath,
      type: "folder" as const,
      children: [],
    };
  });

  return [...folderNodes.sort((a, b) => a.name.localeCompare(b.name)), ...fileNodes.sort((a, b) => a.name.localeCompare(b.name))];
}

export function matchesSearch(node: TreeNode, query: string): boolean {
  const lower = query.toLowerCase();
  if (node.name.toLowerCase().includes(lower)) return true;
  if (node.children) {
    return node.children.some((child) => matchesSearch(child, lower));
  }
  return false;
}
