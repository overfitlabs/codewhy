import React, { useState, useMemo } from 'react';
import { 
  FolderTree, 
  Folder, 
  FolderOpen, 
  File, 
  ChevronRight, 
  ChevronDown, 
  Search, 
  FileCode,
  Tag
} from 'lucide-react';

function TreeNode({ node, depth = 0, filterText = '' }) {
  const [isOpen, setIsOpen] = useState(depth === 0 || Boolean(filterText));
  const isDirectory = node.type === 'directory';

  // Format file size
  const formattedSize = node.size ? `${(node.size / 1024).toFixed(1)} KB` : null;

  return (
    <div className="text-xs font-mono select-none">
      <div
        onClick={() => isDirectory && setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 py-1 px-2 rounded hover:bg-neutral-100 dark:hover:bg-[#21262d] transition-colors cursor-pointer group ${
          isDirectory 
            ? 'text-neutral-800 dark:text-[#f0f6fc] font-medium' 
            : 'text-neutral-600 dark:text-[#8b949e]'
        }`}
        style={{ paddingLeft: `${depth * 1.25 + 0.5}rem` }}
      >
        {isDirectory ? (
          <>
            <span className="text-neutral-400 dark:text-[#6e7681] w-3 shrink-0">
              {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </span>
            {isOpen ? (
              <FolderOpen className="w-3.5 h-3.5 text-blue-500 dark:text-[#58a6ff] shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-blue-500 dark:text-[#58a6ff] shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
            {node.fileCount > 0 && (
              <span className="text-[10px] text-neutral-400 dark:text-[#6e7681] font-sans font-normal ml-1">
                ({node.fileCount})
              </span>
            )}
            {node.role && (
              <span className="ml-auto text-[10px] font-sans font-normal px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-[#21262d] text-neutral-600 dark:text-[#8b949e] border border-neutral-200 dark:border-[#30363d] hidden sm:inline">
                {node.role}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <FileCode className="w-3.5 h-3.5 text-neutral-400 dark:text-[#6e7681] shrink-0" />
            <span className="truncate text-neutral-700 dark:text-[#c9d1d9] group-hover:text-blue-600 dark:group-hover:text-[#58a6ff]">
              {node.name}
            </span>
            {formattedSize && (
              <span className="ml-auto text-[10px] text-neutral-400 dark:text-[#6e7681] font-sans">
                {formattedSize}
              </span>
            )}
          </>
        )}
      </div>

      {isDirectory && isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} filterText={filterText} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FilesTab({ structure, totalFiles }) {
  const [filter, setFilter] = useState('');
  const { tree, classifiedDirectories } = structure;

  // Filter tree nodes if search text is entered
  const filteredTree = useMemo(() => {
    if (!filter.trim()) return tree;

    const term = filter.toLowerCase().trim();

    function filterNode(node) {
      if (node.name.toLowerCase().includes(term)) return node;
      if (node.children) {
        const matchingChildren = node.children
          .map(filterNode)
          .filter(Boolean);

        if (matchingChildren.length > 0) {
          return { ...node, children: matchingChildren };
        }
      }
      return null;
    }

    return (tree || []).map(filterNode).filter(Boolean);
  }, [tree, filter]);

  return (
    <div className="space-y-6">
      {/* Top Filter and Classified Bar */}
      <div className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400 dark:text-[#6e7681]" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter files or directories..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded border border-neutral-300 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] text-neutral-900 dark:text-[#f0f6fc] placeholder-neutral-400 dark:placeholder-[#6e7681] focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-[#8b949e]">
          <span className="font-mono text-neutral-800 dark:text-[#c9d1d9] font-medium">
            {totalFiles}
          </span>
          <span>total indexed repository files</span>
        </div>
      </div>

      {/* Explorer Container */}
      <div className="rounded-lg border border-neutral-200 dark:border-[#30363d] bg-white dark:bg-[#161b22] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-neutral-200 dark:border-[#30363d] bg-neutral-50 dark:bg-[#0d1117] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-700 dark:text-[#c9d1d9]">
            <FolderTree className="w-4 h-4 text-neutral-400 dark:text-[#6e7681]" />
            <span>Repository Directory Hierarchy</span>
          </div>
          <span className="text-[11px] text-neutral-400 dark:text-[#6e7681] font-mono">
            {filter ? `Filtered results` : `Root view`}
          </span>
        </div>

        <div className="p-3 max-h-[580px] overflow-y-auto">
          {filteredTree && filteredTree.length > 0 ? (
            filteredTree.map((node) => (
              <TreeNode key={node.path} node={node} depth={0} filterText={filter} />
            ))
          ) : (
            <div className="py-12 text-center text-xs text-neutral-400 dark:text-[#6e7681]">
              No files or folders matching "{filter}".
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
