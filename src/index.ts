export { default } from "./plugin/index.js";
export { default as remarkGitlab } from "./remark/index.js";
export type { PluginOptions, ResolvedOptions } from "./options.js";
export type {
  ProjectInfoData,
  ReleaseData,
  IssueData,
  ReadmeData,
  FileData,
  FetchError,
} from "./gitlab/types.js";
