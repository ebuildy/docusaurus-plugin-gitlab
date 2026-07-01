# Changelog

## [0.2.0](https://github.com/ebuildy/docusaurus-plugin-gitlab/compare/docusaurus-plugin-gitlab-v0.1.0...docusaurus-plugin-gitlab-v0.2.0) (2026-07-01)


### Features

* add built-in convertAlerts for GitLab alerts -&gt; Docusaurus admonitions ([f624a99](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/f624a9901771c7d825129bf32119ed55bc1eb79b))
* add built-in fixInlineStyles for HTML style attributes in includes ([a2fc976](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/a2fc97602bd79b63f87759004032ab4eb5ffe7fd))
* add built-in fixVoidTags for MDX-unsafe void elements in includes ([9ede881](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/9ede88143f7a95878f6bc9fcc564c5c286a9b70e))
* add card theme CSS builder and option validation ([a49af54](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/a49af54e4d6133bd45dab539a3a49e077a4a1d02))
* add docusaurus plugin that injects the card theme ([ca14a22](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/ca14a2232d75dc0ca78eaeaf7fc78fa64489b8cc))
* add Docusaurus plugin wiring the include loader and theme css ([fec4d7e](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/fec4d7ea37b5452c193459631d17cfa73cc911a4))
* add frontmatter strip and code-range detection for includes ([0339858](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/03398582e69a698c871a5c48e5554981722640e8))
* add include context singleton and webpack loader ([5f6badf](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/5f6badf696a432b90112a8a612ee46fcf4d94224))
* add include placeholder grammar parser ([5a2b909](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/5a2b90934fed9ff08196ff1788dc2befcd81ae30))
* add opt-in stripToc to remove redundant Table of Contents from includes ([321cf30](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/321cf30cd93d73a8d11b749d35376604688108e2))
* add outProcessors + built-in fixAutolinks for include markdown ([c2825fe](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/c2825fe0a23d815cbf311d3235c34cb5af4e2592))
* add prose transform (assets, links, MDX escape) for includes ([02e151f](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/02e151feb3eef5668f086c53c4b3f23476cca155))
* add raw-source fetchers for include placeholders ([bcbd452](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/bcbd4522f5176ee60b0db23d3b7e4f1192065603))
* add renderSource combining code-aware markdown + code-fence modes ([f7cbbfa](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/f7cbbfa0c71342ac63395fc7ea638708c9fdb69d))
* add transformIncludes orchestration for placeholders ([3e677d5](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/3e677d55021d08761a4fd909de90546b072946c2))
* drive card styles from --gl-card-* theme variables ([2bba79a](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/2bba79aebe41b2537cd2ef7b71f3f9dc6b14dc9c))
* estree bridge to merge README headings into the page toc export ([3258404](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/32584045d25cc788870795d8eab9943ee59ed9b5))
* estree bridge to merge README headings into the page toc export ([fc4424c](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/fc4424cbb675028d00dbfe834e1d20bea688a099))
* fetchReadme reads the toc attribute and returns sidebar entries ([c53c06e](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/c53c06e60dee6933105f9c3435b9dcea61942c59))
* fetchReadme reads the toc attribute and returns sidebar entries ([5dc8a6b](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/5dc8a6ba5dbb4b02ee52b0a57efab8d662b94b25))
* humanize star and fork counts (6000 -&gt; 6k) ([f060a17](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/f060a172fcd386a68643f13eb01f474d3d55eba5))
* initial commit ([b5bd870](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/b5bd870de9d8b07e51d0811a58f437a4e6fb925e))
* localize project avatar at build time ([f1453ab](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/f1453ab51d52109fa738683455b15b37981c0cbc))
* merge sidebar README headings into the page toc during transform ([c94bb1a](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/c94bb1ad1297223470ac7cffa1ce0edea194a73f))
* merge sidebar README headings into the page toc during transform ([485bc1e](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/485bc1e6907df993a7496945d7d004593511eb1f))
* mode-aware TOC rendering in rehypeGitlabToc ([00587c9](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/00587c903e03db1e89238e2b204b7ca416dc9521))
* mode-aware TOC rendering in rehypeGitlabToc ([c657863](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/c657863ce46fc2f0b04b4870516461a2308454b4))
* pure TOC-item nesting and merge helpers ([c716dbe](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/c716dbe99b892f3eea54baed116bbc6a7eebdbe5))
* pure TOC-item nesting and merge helpers ([8998514](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/89985144a15967b0f2d8a683586c31fd19c79e71))
* render GitLab [!type] blockquote alerts ([2c539c9](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/2c539c91ca92731e42ef66bce2022f0ae83076d9))
* render GitLab [[_TOC_]] marker as a real table of contents ([7deba1d](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/7deba1dc182a299f6c27b2137f2444068c019924))
* ship theme.css with release styling; consume it in the example ([fd8b4c9](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/fd8b4c9dff0e2341bebf8e926235f1b96f2ef699))
* show project avatar in GitlabProjectInfo ([7783fed](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/7783fed2d2a09d48df79b37b6b12bb039e12bbcb))
* style the issues list with dedicated classes and state badge ([3b63556](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/3b6355617b6399c3ecca743303640f84d8123728))


### Bug Fixes

* accept Docusaurus-injected id in theme plugin options ([9b00c6d](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/9b00c6d591a7aff6c8d898b106a5b9bdb5f30bd5))
* avoid polynomial ReDoS in convertAlerts newline trim ([95d4c80](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/95d4c80e20a878f65c112c8a8e71d49ff1e642ae))
* don't statically resolve dist/ in packaging test (breaks CI typecheck) ([ebba1bc](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/ebba1bcc8bd2dffb2e2c494a47e77ec9c3671677))
* extract alert title across inline nodes, no body leak ([35a0dd4](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/35a0dd4601380b5a0418064014eb7d2d84ff1d94))
* match whitespace (not just space) before img src in include rewrite ([83e3d0a](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/83e3d0ad8a1c10d76a3e9a664a1fe4e5fe54ec17))
* ship ESM-only to avoid broken require(ESM) interop ([aecee62](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/aecee62f775921da7085e8f5bf6c49a25ff10105))
* single-pass position-based include substitution ([1ba6b42](https://github.com/ebuildy/docusaurus-plugin-gitlab/commit/1ba6b42a247594f5cf6649a8b0e908a460bae26b))
