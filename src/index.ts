export { default } from "./plugin/index.js";
export { default as remarkGitlab } from "./remark/index.js";
export { fixAutolinks, fixVoidTags } from "./include/out-processors.js";
export type { OutProcessor } from "./include/out-processors.js";
export type { PluginOptions, ResolvedOptions } from "./options.js";
export type {
  ProjectInfoData,
  ReleaseData,
  IssueData,
  ReadmeData,
  FileData,
  FetchError,
} from "./gitlab/types.js";
