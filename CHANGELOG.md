## [2026.8.0](https://github.com/linearis-oss/linearis/compare/v2026.7.0...v2026.8.0) (2026-08-14)

### ⚠ BREAKING CHANGES

* **milestones:** a milestone name that the scoped project does not carry
now fails instead of resolving to a same-named milestone in another
project.
* **projects:** `linearis projects archive <project>` is removed. Use
`linearis projects delete <project>` to trash a project and
`linearis projects unarchive <project>` to restore it. Linear treats
archived and trashed projects as one state, so the replacement is
behaviourally identical.

### Features

* **attachments:** add disable-sync ([9e7cf04](https://github.com/linearis-oss/linearis/commit/9e7cf044fe240dc665f31a51f5f2b8b820bd6f3c))
* **issues:** accept subscribers and delegate in batch create ([67ea490](https://github.com/linearis-oss/linearis/commit/67ea490da975d9cc5ded0d2ba2b82ed302710347))
* **issues:** add batch create and batch update ([fb68bcf](https://github.com/linearis-oss/linearis/commit/fb68bcfd2cc2a47bc9dde0018d88bc2d2374a8f4))
* **issues:** add from-branch to find an issue by its git branch ([1c0ee8c](https://github.com/linearis-oss/linearis/commit/1c0ee8c97864dea24a4ba2b895f18a4c07639f32))
* **issues:** add order-by, unassigned, state-type and subscriber filters ([2e01ad3](https://github.com/linearis-oss/linearis/commit/2e01ad344b9dbd3f815b7c15a957283687b4faf2))
* **issues:** add restore and snooze ([00bf191](https://github.com/linearis-oss/linearis/commit/00bf1919625da595cd51b7f51b7185b24cbd655b))
* **issues:** add subscribe, share and remind commands ([1530903](https://github.com/linearis-oss/linearis/commit/1530903ddf5962faf53365f17c9600f540b553d7))
* **issues:** let batch update clear a cycle or milestone ([70aafb9](https://github.com/linearis-oss/linearis/commit/70aafb94c28741056ea49eebf8d5184f96d05f69))
* **issues:** publish a JSON Schema for batch create documents ([13ed81a](https://github.com/linearis-oss/linearis/commit/13ed81a20e27d97d079b49ab9770564a70095781))
* **issues:** return url, creator, delegate and lifecycle timestamps ([2d4885e](https://github.com/linearis-oss/linearis/commit/2d4885e9c737bcd1c3e8d7657969c91eb3046ba8))
* **issues:** support team moves, subscribers and delegates ([8c96db1](https://github.com/linearis-oss/linearis/commit/8c96db11c2f3d61c8cb37174c6e92d633a51f936))
* **issues:** take batch update from a JSON document too ([60b9491](https://github.com/linearis-oss/linearis/commit/60b94914b724155e4ee9993558e6fc7f13225fd6))
* **labels:** full CRUD and retire/restore for project labels ([4bf8dcc](https://github.com/linearis-oss/linearis/commit/4bf8dcc50e69b764f87bc8c1712c2a72f3dcdd76))
* **labels:** make the group and parent flags reversible ([59d5890](https://github.com/linearis-oss/linearis/commit/59d58900933f939aba1af08439d006f6bde51533))
* **projects:** administer the workspace project status flow ([a6e1a16](https://github.com/linearis-oss/linearis/commit/a6e1a1613b0beb76a94c807b7dfb7caa7ee19403))
* **projects:** chronological project activity timeline ([4e81324](https://github.com/linearis-oss/linearis/commit/4e813240026de27618e388c9322c919151e24f02))
* **projects:** drop archive in favour of delete ([47b509e](https://github.com/linearis-oss/linearis/commit/47b509e79339d5882cfddfd32fca920217f02ce9))
* **projects:** full-text search and external sync disable ([de351cf](https://github.com/linearis-oss/linearis/commit/de351cfda0b093261f1d3d4c6ae1e0830061bceb))
* **projects:** manage project dependency relations ([bdd3de0](https://github.com/linearis-oss/linearis/commit/bdd3de0726ca334dc0de4220a120b139c71e1205))
* **projects:** post and manage project status updates ([c66da2b](https://github.com/linearis-oss/linearis/commit/c66da2b7860438683fd90a39d3e8f91a9ce34709))
* **projects:** read one dependency and page them workspace-wide ([2e9440c](https://github.com/linearis-oss/linearis/commit/2e9440c3b21b376b37eecaf7115203cd04341853))

### Bug Fixes

* **issues:** await user lookups so failures stay JSON ([cd42347](https://github.com/linearis-oss/linearis/commit/cd42347d321d51d609ddda92a3434baeebd40a45))
* **issues:** guard batch update labels across teams too ([c716701](https://github.com/linearis-oss/linearis/commit/c7167010810526ca8d0c790ead1cc0788fb0bd22))
* **issues:** let a UUID pass the mixed-team batch guard ([5a248a8](https://github.com/linearis-oss/linearis/commit/5a248a8c102af4c3be7a6e4f7f9adcc21464bf22))
* **issues:** locate the entry when a batch list is malformed ([b83ea52](https://github.com/linearis-oss/linearis/commit/b83ea52695a356ba9650cc68b506010a3ed7bd66))
* **issues:** make --include-archived surface archived issues ([cb14ec7](https://github.com/linearis-oss/linearis/commit/cb14ec7469a8d421c4ccbd7c7e3112fe95a566d3))
* **issues:** make archived issues reachable by identifier ([6ac9829](https://github.com/linearis-oss/linearis/commit/6ac98297ed9d4c675d0e77ec59e395313efa4f84))
* **issues:** name the flag when a relative offset overflows ([634f846](https://github.com/linearis-oss/linearis/commit/634f846900a27993c5ccff402db90e7bc6aa7560))
* **issues:** resolve a `me` assignee against the viewer ([d5f8198](https://github.com/linearis-oss/linearis/commit/d5f81985ab9632db78b968a043398260c97a336b))
* **issues:** validate a moved issue's estimate against its new team ([c8d94f1](https://github.com/linearis-oss/linearis/commit/c8d94f1518f0066d5b7153c4a5d0c26f75a430b8))
* **issues:** validate batch update estimates against the team scale ([31634dc](https://github.com/linearis-oss/linearis/commit/31634dce7b6ebf384475f0188adeb4941b77f6f3))
* **labels:** reject an empty --parent on update ([fd13029](https://github.com/linearis-oss/linearis/commit/fd13029a135cc2208640d31533425074971ef87c))
* **labels:** scope --parent to the same team as the label ([d99ee89](https://github.com/linearis-oss/linearis/commit/d99ee89f6302f4e45a276acb73cbb65a4a9e0a99))
* **milestones:** keep a milestone lookup inside its project ([b143d2b](https://github.com/linearis-oss/linearis/commit/b143d2bf1bd801e757fc913fda2f5157ada7c470))
* **projects:** anchor relation updates to the right end ([9f5e87a](https://github.com/linearis-oss/linearis/commit/9f5e87ab3a05564297f9dc7e5bdafee01f8afbeb))
* **projects:** bound and page the project status flow ([9ebdef7](https://github.com/linearis-oss/linearis/commit/9ebdef7301346bcd9ea222b5a1ba989698aa74e3))
* **projects:** count archived statuses when appending ([1e3b428](https://github.com/linearis-oss/linearis/commit/1e3b4283e7cb375732fa1f1c54475a5f104dcf81))
* **projects:** refuse a lone relation match past the page bound ([d5eb26d](https://github.com/linearis-oss/linearis/commit/d5eb26d58302b05756837b0c70827df46de2e526))
* **projects:** refuse to guess between same-named project statuses ([1be4ab1](https://github.com/linearis-oss/linearis/commit/1be4ab102f03ce6582f02100090e46c4f268fac2))
* **projects:** refuse to guess which relation a project pair means ([fe3508c](https://github.com/linearis-oss/linearis/commit/fe3508c6ec2d8c5e817c4f7b584a4ae97bd68aa5))
* **projects:** reject a malformed status position ([e01ca0e](https://github.com/linearis-oss/linearis/commit/e01ca0e900d3c731784d2d75aa84a88ae4d81c20))
* **projects:** reject an empty relation update before resolving it ([d94e51e](https://github.com/linearis-oss/linearis/commit/d94e51eab34fdc55825f448b6b59b95ba47478e6))
* **projects:** reject pagination flags on per-project relations ([ed7cc89](https://github.com/linearis-oss/linearis/commit/ed7cc89e22368bea83373a8a7b989bc9b81c535b))
* **projects:** report the relation page bound instead of a miss ([b3886e4](https://github.com/linearis-oss/linearis/commit/b3886e4bc55774d441d021f272664495893487f9))
* **projects:** say where the projects went when archiving fails ([30664cd](https://github.com/linearis-oss/linearis/commit/30664cd7583443140eebf76a64287d0888bd09aa))
* **projects:** scope relation milestones on the UUID path ([5824b02](https://github.com/linearis-oss/linearis/commit/5824b02c2a3d3cc51cf36af67f81efa009b3f8ec))
* **release:** pin conventionalcommits preset to the writer-v8-compatible line ([fc0276d](https://github.com/linearis-oss/linearis/commit/fc0276d163cf7edce50c41c0533afd902a18a534))

### Performance Improvements

* **issues:** bound the fan-out of batch create ID resolution ([f623be9](https://github.com/linearis-oss/linearis/commit/f623be9c49de173d872c66774a0e0e90dcd61ace))

## [2026.8.0-next.2](https://github.com/linearis-oss/linearis/compare/v2026.8.0-next.1...v2026.8.0-next.2) (2026-08-10)

### ⚠ BREAKING CHANGES

* **milestones:** a milestone name that the scoped project does not carry
now fails instead of resolving to a same-named milestone in another
project.
* **projects:** `linearis projects archive <project>` is removed. Use
`linearis projects delete <project>` to trash a project and
`linearis projects unarchive <project>` to restore it. Linear treats
archived and trashed projects as one state, so the replacement is
behaviourally identical.

### Features

* **labels:** full CRUD and retire/restore for project labels ([4bf8dcc](https://github.com/linearis-oss/linearis/commit/4bf8dcc50e69b764f87bc8c1712c2a72f3dcdd76))
* **labels:** make the group and parent flags reversible ([59d5890](https://github.com/linearis-oss/linearis/commit/59d58900933f939aba1af08439d006f6bde51533))
* **projects:** administer the workspace project status flow ([a6e1a16](https://github.com/linearis-oss/linearis/commit/a6e1a1613b0beb76a94c807b7dfb7caa7ee19403))
* **projects:** chronological project activity timeline ([4e81324](https://github.com/linearis-oss/linearis/commit/4e813240026de27618e388c9322c919151e24f02))
* **projects:** drop archive in favour of delete ([47b509e](https://github.com/linearis-oss/linearis/commit/47b509e79339d5882cfddfd32fca920217f02ce9))
* **projects:** full-text search and external sync disable ([de351cf](https://github.com/linearis-oss/linearis/commit/de351cfda0b093261f1d3d4c6ae1e0830061bceb))
* **projects:** manage project dependency relations ([bdd3de0](https://github.com/linearis-oss/linearis/commit/bdd3de0726ca334dc0de4220a120b139c71e1205))
* **projects:** post and manage project status updates ([c66da2b](https://github.com/linearis-oss/linearis/commit/c66da2b7860438683fd90a39d3e8f91a9ce34709))
* **projects:** read one dependency and page them workspace-wide ([2e9440c](https://github.com/linearis-oss/linearis/commit/2e9440c3b21b376b37eecaf7115203cd04341853))

### Bug Fixes

* **labels:** reject an empty --parent on update ([fd13029](https://github.com/linearis-oss/linearis/commit/fd13029a135cc2208640d31533425074971ef87c))
* **labels:** scope --parent to the same team as the label ([d99ee89](https://github.com/linearis-oss/linearis/commit/d99ee89f6302f4e45a276acb73cbb65a4a9e0a99))
* **milestones:** keep a milestone lookup inside its project ([b143d2b](https://github.com/linearis-oss/linearis/commit/b143d2bf1bd801e757fc913fda2f5157ada7c470))
* **projects:** anchor relation updates to the right end ([9f5e87a](https://github.com/linearis-oss/linearis/commit/9f5e87ab3a05564297f9dc7e5bdafee01f8afbeb))
* **projects:** bound and page the project status flow ([9ebdef7](https://github.com/linearis-oss/linearis/commit/9ebdef7301346bcd9ea222b5a1ba989698aa74e3))
* **projects:** count archived statuses when appending ([1e3b428](https://github.com/linearis-oss/linearis/commit/1e3b4283e7cb375732fa1f1c54475a5f104dcf81))
* **projects:** refuse a lone relation match past the page bound ([d5eb26d](https://github.com/linearis-oss/linearis/commit/d5eb26d58302b05756837b0c70827df46de2e526))
* **projects:** refuse to guess between same-named project statuses ([1be4ab1](https://github.com/linearis-oss/linearis/commit/1be4ab102f03ce6582f02100090e46c4f268fac2))
* **projects:** refuse to guess which relation a project pair means ([fe3508c](https://github.com/linearis-oss/linearis/commit/fe3508c6ec2d8c5e817c4f7b584a4ae97bd68aa5))
* **projects:** reject a malformed status position ([e01ca0e](https://github.com/linearis-oss/linearis/commit/e01ca0e900d3c731784d2d75aa84a88ae4d81c20))
* **projects:** reject an empty relation update before resolving it ([d94e51e](https://github.com/linearis-oss/linearis/commit/d94e51eab34fdc55825f448b6b59b95ba47478e6))
* **projects:** reject pagination flags on per-project relations ([ed7cc89](https://github.com/linearis-oss/linearis/commit/ed7cc89e22368bea83373a8a7b989bc9b81c535b))
* **projects:** report the relation page bound instead of a miss ([b3886e4](https://github.com/linearis-oss/linearis/commit/b3886e4bc55774d441d021f272664495893487f9))
* **projects:** say where the projects went when archiving fails ([30664cd](https://github.com/linearis-oss/linearis/commit/30664cd7583443140eebf76a64287d0888bd09aa))
* **projects:** scope relation milestones on the UUID path ([5824b02](https://github.com/linearis-oss/linearis/commit/5824b02c2a3d3cc51cf36af67f81efa009b3f8ec))

## [2026.8.0-next.1](https://github.com/linearis-oss/linearis/compare/v2026.7.0...v2026.8.0-next.1) (2026-08-10)

### Features

* **attachments:** add disable-sync ([9e7cf04](https://github.com/linearis-oss/linearis/commit/9e7cf044fe240dc665f31a51f5f2b8b820bd6f3c))
* **issues:** accept subscribers and delegate in batch create ([67ea490](https://github.com/linearis-oss/linearis/commit/67ea490da975d9cc5ded0d2ba2b82ed302710347))
* **issues:** add batch create and batch update ([fb68bcf](https://github.com/linearis-oss/linearis/commit/fb68bcfd2cc2a47bc9dde0018d88bc2d2374a8f4))
* **issues:** add from-branch to find an issue by its git branch ([1c0ee8c](https://github.com/linearis-oss/linearis/commit/1c0ee8c97864dea24a4ba2b895f18a4c07639f32))
* **issues:** add order-by, unassigned, state-type and subscriber filters ([2e01ad3](https://github.com/linearis-oss/linearis/commit/2e01ad344b9dbd3f815b7c15a957283687b4faf2))
* **issues:** add restore and snooze ([00bf191](https://github.com/linearis-oss/linearis/commit/00bf1919625da595cd51b7f51b7185b24cbd655b))
* **issues:** add subscribe, share and remind commands ([1530903](https://github.com/linearis-oss/linearis/commit/1530903ddf5962faf53365f17c9600f540b553d7))
* **issues:** let batch update clear a cycle or milestone ([70aafb9](https://github.com/linearis-oss/linearis/commit/70aafb94c28741056ea49eebf8d5184f96d05f69))
* **issues:** publish a JSON Schema for batch create documents ([13ed81a](https://github.com/linearis-oss/linearis/commit/13ed81a20e27d97d079b49ab9770564a70095781))
* **issues:** return url, creator, delegate and lifecycle timestamps ([2d4885e](https://github.com/linearis-oss/linearis/commit/2d4885e9c737bcd1c3e8d7657969c91eb3046ba8))
* **issues:** support team moves, subscribers and delegates ([8c96db1](https://github.com/linearis-oss/linearis/commit/8c96db11c2f3d61c8cb37174c6e92d633a51f936))
* **issues:** take batch update from a JSON document too ([60b9491](https://github.com/linearis-oss/linearis/commit/60b94914b724155e4ee9993558e6fc7f13225fd6))

### Bug Fixes

* **issues:** await user lookups so failures stay JSON ([cd42347](https://github.com/linearis-oss/linearis/commit/cd42347d321d51d609ddda92a3434baeebd40a45))
* **issues:** guard batch update labels across teams too ([c716701](https://github.com/linearis-oss/linearis/commit/c7167010810526ca8d0c790ead1cc0788fb0bd22))
* **issues:** let a UUID pass the mixed-team batch guard ([5a248a8](https://github.com/linearis-oss/linearis/commit/5a248a8c102af4c3be7a6e4f7f9adcc21464bf22))
* **issues:** locate the entry when a batch list is malformed ([b83ea52](https://github.com/linearis-oss/linearis/commit/b83ea52695a356ba9650cc68b506010a3ed7bd66))
* **issues:** make --include-archived surface archived issues ([cb14ec7](https://github.com/linearis-oss/linearis/commit/cb14ec7469a8d421c4ccbd7c7e3112fe95a566d3))
* **issues:** make archived issues reachable by identifier ([6ac9829](https://github.com/linearis-oss/linearis/commit/6ac98297ed9d4c675d0e77ec59e395313efa4f84))
* **issues:** name the flag when a relative offset overflows ([634f846](https://github.com/linearis-oss/linearis/commit/634f846900a27993c5ccff402db90e7bc6aa7560))
* **issues:** resolve a `me` assignee against the viewer ([d5f8198](https://github.com/linearis-oss/linearis/commit/d5f81985ab9632db78b968a043398260c97a336b))
* **issues:** validate a moved issue's estimate against its new team ([c8d94f1](https://github.com/linearis-oss/linearis/commit/c8d94f1518f0066d5b7153c4a5d0c26f75a430b8))
* **issues:** validate batch update estimates against the team scale ([31634dc](https://github.com/linearis-oss/linearis/commit/31634dce7b6ebf384475f0188adeb4941b77f6f3))
* **release:** pin conventionalcommits preset to the writer-v8-compatible line ([fc0276d](https://github.com/linearis-oss/linearis/commit/fc0276d163cf7edce50c41c0533afd902a18a534))

### Performance Improvements

* **issues:** bound the fan-out of batch create ID resolution ([f623be9](https://github.com/linearis-oss/linearis/commit/f623be9c49de173d872c66774a0e0e90dcd61ace))

## [2026.7.0](https://github.com/linearis-oss/linearis/compare/v2026.6.0...v2026.7.0) (2026-08-07)

### Features

* **initiatives:** add --clear-owner to initiatives update ([fb401ea](https://github.com/linearis-oss/linearis/commit/fb401ea029bd559140567ea61c6ff1493609b3ea)), closes [#282](https://github.com/linearis-oss/linearis/issues/282)
* **issues:** add --clear-assignee and --clear-project to issues update ([9a5ca75](https://github.com/linearis-oss/linearis/commit/9a5ca7529efdec30d95c77838f947f6e7255b225)), closes [#282](https://github.com/linearis-oss/linearis/issues/282) [#282](https://github.com/linearis-oss/linearis/issues/282)

### Bug Fixes

* **cli:** classify the two option-shaped parse failures ([19ec395](https://github.com/linearis-oss/linearis/commit/19ec3955285f7fcad3d74e21b294604f59d54ccb)), closes [#281](https://github.com/linearis-oss/linearis/issues/281)
* **cli:** disable Commander's implicit help subcommand ([de405af](https://github.com/linearis-oss/linearis/commit/de405afd709abe27cac3fedf0e06165e7b0becc5)), closes [#281](https://github.com/linearis-oss/linearis/issues/281)
* **cli:** emit JSON envelope for argument-parse errors ([3bd0e38](https://github.com/linearis-oss/linearis/commit/3bd0e3899d64bfa5195009d686cf2cbdddc4ed06)), closes [#281](https://github.com/linearis-oss/linearis/issues/281)
* **cli:** give every bare command group the same MISSING_SUBCOMMAND envelope ([b4c3a8b](https://github.com/linearis-oss/linearis/commit/b4c3a8b58690da398c702147b1c1446f00ab34ca))
* **cli:** keep the usage-error message on a single line ([a447807](https://github.com/linearis-oss/linearis/commit/a4478075c73af9e0c0d3af699c68402559c05343))
* **common:** point auth recovery at 'auth login', not the bare group ([cca71ec](https://github.com/linearis-oss/linearis/commit/cca71ec64c86148dbaa27987933d6fae05541082)), closes [#281](https://github.com/linearis-oss/linearis/issues/281)
* **deps:** update dependency commander to v15 ([290424a](https://github.com/linearis-oss/linearis/commit/290424ae2a7f53d3b014de822187429d4fc350b6))
* **deps:** update dependency graphql to v16.14.2 ([ca72bf7](https://github.com/linearis-oss/linearis/commit/ca72bf7ac32f40643f8b34b7bcafe15675f07226))
* **deps:** update dependency graphql to v17 ([05bb7af](https://github.com/linearis-oss/linearis/commit/05bb7af33f14b5ab91e6c9797d613ac192c58c80))
* **projects:** bound project query connections to avoid complexity limit ([dfe97b8](https://github.com/linearis-oss/linearis/commit/dfe97b8f0c3cf15c5fc40a7861f2cd422fdc30b9)), closes [#276](https://github.com/linearis-oss/linearis/issues/276) [#283](https://github.com/linearis-oss/linearis/issues/283)
* **projects:** surface truncation on bounded connections, lock bounds in tests ([a3145c1](https://github.com/linearis-oss/linearis/commit/a3145c1b99273c11b1e7f077cf2799f63ae4c141)), closes [#276](https://github.com/linearis-oss/linearis/issues/276) [#284](https://github.com/linearis-oss/linearis/issues/284)
* **usage:** list nested group subcommands in domain usage ([2bff44f](https://github.com/linearis-oss/linearis/commit/2bff44ff745df8e186d4a46f92feaac65ac4740c)), closes [#281](https://github.com/linearis-oss/linearis/issues/281)

## [2026.7.0-next.6](https://github.com/linearis-oss/linearis/compare/v2026.7.0-next.5...v2026.7.0-next.6) (2026-08-07)

### Bug Fixes

* **projects:** bound project query connections to avoid complexity limit ([dfe97b8](https://github.com/linearis-oss/linearis/commit/dfe97b8f0c3cf15c5fc40a7861f2cd422fdc30b9)), closes [#276](https://github.com/linearis-oss/linearis/issues/276) [#283](https://github.com/linearis-oss/linearis/issues/283)
* **projects:** surface truncation on bounded connections, lock bounds in tests ([a3145c1](https://github.com/linearis-oss/linearis/commit/a3145c1b99273c11b1e7f077cf2799f63ae4c141)), closes [#276](https://github.com/linearis-oss/linearis/issues/276) [#284](https://github.com/linearis-oss/linearis/issues/284)

## [2026.7.0-next.5](https://github.com/linearis-oss/linearis/compare/v2026.7.0-next.4...v2026.7.0-next.5) (2026-08-06)

### Bug Fixes

* **deps:** update dependency graphql to v17 ([05bb7af](https://github.com/linearis-oss/linearis/commit/05bb7af33f14b5ab91e6c9797d613ac192c58c80))

## [2026.7.0-next.4](https://github.com/linearis-oss/linearis/compare/v2026.7.0-next.3...v2026.7.0-next.4) (2026-08-06)

### Bug Fixes

* **cli:** classify the two option-shaped parse failures ([19ec395](https://github.com/linearis-oss/linearis/commit/19ec3955285f7fcad3d74e21b294604f59d54ccb)), closes [#281](https://github.com/linearis-oss/linearis/issues/281)
* **cli:** disable Commander's implicit help subcommand ([de405af](https://github.com/linearis-oss/linearis/commit/de405afd709abe27cac3fedf0e06165e7b0becc5)), closes [#281](https://github.com/linearis-oss/linearis/issues/281)
* **cli:** emit JSON envelope for argument-parse errors ([3bd0e38](https://github.com/linearis-oss/linearis/commit/3bd0e3899d64bfa5195009d686cf2cbdddc4ed06)), closes [#281](https://github.com/linearis-oss/linearis/issues/281)
* **cli:** give every bare command group the same MISSING_SUBCOMMAND envelope ([b4c3a8b](https://github.com/linearis-oss/linearis/commit/b4c3a8b58690da398c702147b1c1446f00ab34ca))
* **cli:** keep the usage-error message on a single line ([a447807](https://github.com/linearis-oss/linearis/commit/a4478075c73af9e0c0d3af699c68402559c05343))
* **common:** point auth recovery at 'auth login', not the bare group ([cca71ec](https://github.com/linearis-oss/linearis/commit/cca71ec64c86148dbaa27987933d6fae05541082)), closes [#281](https://github.com/linearis-oss/linearis/issues/281)
* **usage:** list nested group subcommands in domain usage ([2bff44f](https://github.com/linearis-oss/linearis/commit/2bff44ff745df8e186d4a46f92feaac65ac4740c)), closes [#281](https://github.com/linearis-oss/linearis/issues/281)

## [2026.7.0-next.3](https://github.com/linearis-oss/linearis/compare/v2026.7.0-next.2...v2026.7.0-next.3) (2026-08-06)

### Features

* **initiatives:** add --clear-owner to initiatives update ([fb401ea](https://github.com/linearis-oss/linearis/commit/fb401ea029bd559140567ea61c6ff1493609b3ea)), closes [#282](https://github.com/linearis-oss/linearis/issues/282)
* **issues:** add --clear-assignee and --clear-project to issues update ([9a5ca75](https://github.com/linearis-oss/linearis/commit/9a5ca7529efdec30d95c77838f947f6e7255b225)), closes [#282](https://github.com/linearis-oss/linearis/issues/282) [#282](https://github.com/linearis-oss/linearis/issues/282)

## [2026.7.0-next.2](https://github.com/linearis-oss/linearis/compare/v2026.7.0-next.1...v2026.7.0-next.2) (2026-07-06)

### Bug Fixes

* **deps:** update dependency commander to v15 ([290424a](https://github.com/linearis-oss/linearis/commit/290424ae2a7f53d3b014de822187429d4fc350b6))

## [2026.7.0-next.1](https://github.com/linearis-oss/linearis/compare/v2026.6.0...v2026.7.0-next.1) (2026-07-06)

### Bug Fixes

* **deps:** update dependency graphql to v16.14.2 ([ca72bf7](https://github.com/linearis-oss/linearis/commit/ca72bf7ac32f40643f8b34b7bcafe15675f07226))

## [2026.6.0](https://github.com/linearis-oss/linearis/compare/v2026.5.0...v2026.6.0) (2026-07-04)

### Features

* **cli:** add passive update notifier and version command ([6ca3952](https://github.com/linearis-oss/linearis/commit/6ca39522a0845cb84af0ed14cdfd5ba5de23677e))
* **issues:** add activity command with threaded discussion timeline ([38a3ea3](https://github.com/linearis-oss/linearis/commit/38a3ea3379a7c92eba728d0d5ee7537dbd2a452b)), closes [#144](https://github.com/linearis-oss/linearis/issues/144)
* **issues:** restore relation commands ([e0f880c](https://github.com/linearis-oss/linearis/commit/e0f880c8e700b889b0565cae787675c62b3c3eb8))
* **labels:** add issue label CRUD commands ([5fca207](https://github.com/linearis-oss/linearis/commit/5fca207d96e597ef0e755bb0e1eb0135deeae47e))
* **labels:** support label removal modes ([c6cfa62](https://github.com/linearis-oss/linearis/commit/c6cfa627972f825868b8868c50057d7c15e906a6))
* **output:** add --compact and --fields flags for token-efficient output ([682bde9](https://github.com/linearis-oss/linearis/commit/682bde9489176b4dffa26f3e4fd40bdb633fe77c)), closes [#220](https://github.com/linearis-oss/linearis/issues/220)
* **projects:** restore project workflow options ([1f35779](https://github.com/linearis-oss/linearis/commit/1f35779fb07b42beb30d13a9e96917aa2d63d03e))
* restore document attachment compatibility ([f096add](https://github.com/linearis-oss/linearis/commit/f096adda7aa20c946a25c7c06fefec56d9684975))
* **skill:** add agent skill and Claude Code plugin for the CLI ([1233ad9](https://github.com/linearis-oss/linearis/commit/1233ad995e858ee61b925ac580e4b231c6dfa1c8))
* **teams:** add team create, update, and membership management ([c89208b](https://github.com/linearis-oss/linearis/commit/c89208bc7a14514da62caec25364207fa29fbb18)), closes [#142](https://github.com/linearis-oss/linearis/issues/142)

### Bug Fixes

* **ci:** skip PR comment posting for fork pull requests ([390dd38](https://github.com/linearis-oss/linearis/commit/390dd385cded3c3249e3ab9ad13864b1d377b810))
* **discussions:** forward parent entity id when replying to a thread ([745ca56](https://github.com/linearis-oss/linearis/commit/745ca56465e51f2981740a1153eedc01a40e0431)), closes [#226](https://github.com/linearis-oss/linearis/issues/226)
* **labels:** allow clearing label description with empty string ([9a28108](https://github.com/linearis-oss/linearis/commit/9a2810813753f5f3a3e836f5a02d0ceed2eee433))
* **milestones:** use $input convention for milestone mutations ([309aaab](https://github.com/linearis-oss/linearis/commit/309aaab662ab0dc79731f2c288f97d7b75d74caf)), closes [#223](https://github.com/linearis-oss/linearis/issues/223)
* **output:** harden pickFields against prototype-chain keys ([a624313](https://github.com/linearis-oss/linearis/commit/a624313e0d1cb74ed77ddbf1f87a24c3262cdc72)), closes [#220](https://github.com/linearis-oss/linearis/issues/220)
* **resolvers:** restore global cycle fallback in search without team ([c0cbc95](https://github.com/linearis-oss/linearis/commit/c0cbc95889c4b7aaafe7e3281e9c8458bb71fefe)), closes [#126](https://github.com/linearis-oss/linearis/issues/126)
* **retry:** retry native fetch transport failures ([6fc8e64](https://github.com/linearis-oss/linearis/commit/6fc8e64ea83b45ee316307dd14701cb3df696300)), closes [#207](https://github.com/linearis-oss/linearis/issues/207)
* **skill:** comma-separate allowed-tools in SKILL.md frontmatter ([66db248](https://github.com/linearis-oss/linearis/commit/66db24863e1669ac2dad88aa9fc60ca0cfdd0e31))

### Performance Improvements

* **issues:** batch-resolve assignee and IDs in create/update ([819c045](https://github.com/linearis-oss/linearis/commit/819c0451c909bbe2c5d297b6b584ce4da1358391)), closes [#126](https://github.com/linearis-oss/linearis/issues/126)

## [2026.6.0-next.13](https://github.com/linearis-oss/linearis/compare/v2026.6.0-next.12...v2026.6.0-next.13) (2026-07-04)

### Features

* **teams:** add team create, update, and membership management ([c89208b](https://github.com/linearis-oss/linearis/commit/c89208bc7a14514da62caec25364207fa29fbb18)), closes [#142](https://github.com/linearis-oss/linearis/issues/142)

## [2026.6.0-next.12](https://github.com/linearis-oss/linearis/compare/v2026.6.0-next.11...v2026.6.0-next.12) (2026-07-04)

### Features

* **issues:** add activity command with threaded discussion timeline ([38a3ea3](https://github.com/linearis-oss/linearis/commit/38a3ea3379a7c92eba728d0d5ee7537dbd2a452b)), closes [#144](https://github.com/linearis-oss/linearis/issues/144)

## [2026.6.0-next.12](https://github.com/linearis-oss/linearis/compare/v2026.6.0-next.11...v2026.6.0-next.12) (2026-07-04)

### Features

* **issues:** add activity command with threaded discussion timeline ([38a3ea3](https://github.com/linearis-oss/linearis/commit/38a3ea3379a7c92eba728d0d5ee7537dbd2a452b)), closes [#144](https://github.com/linearis-oss/linearis/issues/144)

## [2026.6.0-next.11](https://github.com/linearis-oss/linearis/compare/v2026.6.0-next.10...v2026.6.0-next.11) (2026-07-03)

### Features

* **skill:** add agent skill and Claude Code plugin for the CLI ([1233ad9](https://github.com/linearis-oss/linearis/commit/1233ad995e858ee61b925ac580e4b231c6dfa1c8))

### Bug Fixes

* **skill:** comma-separate allowed-tools in SKILL.md frontmatter ([66db248](https://github.com/linearis-oss/linearis/commit/66db24863e1669ac2dad88aa9fc60ca0cfdd0e31))

## [2026.6.0-next.10](https://github.com/linearis-oss/linearis/compare/v2026.6.0-next.9...v2026.6.0-next.10) (2026-07-03)

### Bug Fixes

* **resolvers:** restore global cycle fallback in search without team ([c0cbc95](https://github.com/linearis-oss/linearis/commit/c0cbc95889c4b7aaafe7e3281e9c8458bb71fefe)), closes [#126](https://github.com/linearis-oss/linearis/issues/126)

### Performance Improvements

* **issues:** batch-resolve assignee and IDs in create/update ([819c045](https://github.com/linearis-oss/linearis/commit/819c0451c909bbe2c5d297b6b584ce4da1358391)), closes [#126](https://github.com/linearis-oss/linearis/issues/126)

## [2026.6.0-next.9](https://github.com/linearis-oss/linearis/compare/v2026.6.0-next.8...v2026.6.0-next.9) (2026-07-03)

### Bug Fixes

* **retry:** retry native fetch transport failures ([6fc8e64](https://github.com/linearis-oss/linearis/commit/6fc8e64ea83b45ee316307dd14701cb3df696300)), closes [#207](https://github.com/linearis-oss/linearis/issues/207)

## [2026.6.0-next.8](https://github.com/linearis-oss/linearis/compare/v2026.6.0-next.7...v2026.6.0-next.8) (2026-07-02)

### Features

* **labels:** add issue label CRUD commands ([5fca207](https://github.com/linearis-oss/linearis/commit/5fca207d96e597ef0e755bb0e1eb0135deeae47e))
* **labels:** support label removal modes ([c6cfa62](https://github.com/linearis-oss/linearis/commit/c6cfa627972f825868b8868c50057d7c15e906a6))

### Bug Fixes

* **labels:** allow clearing label description with empty string ([9a28108](https://github.com/linearis-oss/linearis/commit/9a2810813753f5f3a3e836f5a02d0ceed2eee433))

## [2026.6.0-next.7](https://github.com/linearis-oss/linearis/compare/v2026.6.0-next.6...v2026.6.0-next.7) (2026-07-02)

### Features

* **cli:** add passive update notifier and version command ([6ca3952](https://github.com/linearis-oss/linearis/commit/6ca39522a0845cb84af0ed14cdfd5ba5de23677e))

## [2026.6.0-next.6](https://github.com/linearis-oss/linearis/compare/v2026.6.0-next.5...v2026.6.0-next.6) (2026-07-02)

### Features

* **projects:** restore project workflow options ([1f35779](https://github.com/linearis-oss/linearis/commit/1f35779fb07b42beb30d13a9e96917aa2d63d03e))

### Bug Fixes

* **ci:** skip PR comment posting for fork pull requests ([390dd38](https://github.com/linearis-oss/linearis/commit/390dd385cded3c3249e3ab9ad13864b1d377b810))

## [2026.6.0-next.5](https://github.com/linearis-oss/linearis/compare/v2026.6.0-next.4...v2026.6.0-next.5) (2026-07-02)

### Features

* restore document attachment compatibility ([f096add](https://github.com/linearis-oss/linearis/commit/f096adda7aa20c946a25c7c06fefec56d9684975))

## [2026.6.0-next.4](https://github.com/linearis-oss/linearis/compare/v2026.6.0-next.3...v2026.6.0-next.4) (2026-07-02)

### Features

* **output:** add --compact and --fields flags for token-efficient output ([682bde9](https://github.com/linearis-oss/linearis/commit/682bde9489176b4dffa26f3e4fd40bdb633fe77c)), closes [#220](https://github.com/linearis-oss/linearis/issues/220)

### Bug Fixes

* **output:** harden pickFields against prototype-chain keys ([a624313](https://github.com/linearis-oss/linearis/commit/a624313e0d1cb74ed77ddbf1f87a24c3262cdc72)), closes [#220](https://github.com/linearis-oss/linearis/issues/220)

## [2026.6.0-next.3](https://github.com/linearis-oss/linearis/compare/v2026.6.0-next.2...v2026.6.0-next.3) (2026-07-02)

### Bug Fixes

* **milestones:** use $input convention for milestone mutations ([309aaab](https://github.com/linearis-oss/linearis/commit/309aaab662ab0dc79731f2c288f97d7b75d74caf)), closes [#223](https://github.com/linearis-oss/linearis/issues/223)

## [2026.6.0-next.2](https://github.com/linearis-oss/linearis/compare/v2026.6.0-next.1...v2026.6.0-next.2) (2026-07-02)

### Features

* **issues:** restore relation commands ([e0f880c](https://github.com/linearis-oss/linearis/commit/e0f880c8e700b889b0565cae787675c62b3c3eb8))

## [2026.6.0-next.1](https://github.com/linearis-oss/linearis/compare/v2026.5.0...v2026.6.0-next.1) (2026-06-16)

### Bug Fixes

* **discussions:** forward parent entity id when replying to a thread ([745ca56](https://github.com/linearis-oss/linearis/commit/745ca56465e51f2981740a1153eedc01a40e0431)), closes [#226](https://github.com/linearis-oss/linearis/issues/226)

## [2026.5.0](https://github.com/linearis-oss/linearis/compare/v2026.4.9...v2026.5.0) (2026-06-16)

### Bug Fixes

* **milestones:** pass flat variables to create/update mutations ([66e1a3f](https://github.com/linearis-oss/linearis/commit/66e1a3fcae438957cd6fd5c586bae4ad178e43d4)), closes [#228](https://github.com/linearis-oss/linearis/issues/228)
* **release:** correct calver version during verification ([c393780](https://github.com/linearis-oss/linearis/commit/c393780f1efdb25269ff0d2ef181b8a0ed82fe2e))

## [2026.4.9](https://github.com/linearis-oss/linearis/compare/v2026.4.8...v2026.4.9) (2026-04-27)

### Features

* **cli:** add reaction workflows ([4d6a00c](https://github.com/linearis-oss/linearis/commit/4d6a00cbd9a2c9abe407d5071f3ccd5bbb81e01e)), closes [#83](https://github.com/linearis-oss/linearis/issues/83)
* **comments:** deprecate compatibility facade ([d097eee](https://github.com/linearis-oss/linearis/commit/d097eeee62dfa5446c866644ded70a779346b7e4))
* **discussions:** add GraphQL and service layer ([1ae10e1](https://github.com/linearis-oss/linearis/commit/1ae10e1313722c58102c8269cc97886ed8891d8d))
* **emoji:** add reaction input normalization ([bc82bc6](https://github.com/linearis-oss/linearis/commit/bc82bc6fa3e7c6ee64f6581b80206ec85bf8e9a8)), closes [#83](https://github.com/linearis-oss/linearis/issues/83)
* **graphql:** add reaction operations ([bd0ffac](https://github.com/linearis-oss/linearis/commit/bd0ffaccdba8659fedb6ae4074dc737e102b63b8)), closes [#83](https://github.com/linearis-oss/linearis/issues/83)
* **initiatives:** add discussion commands ([81bcd17](https://github.com/linearis-oss/linearis/commit/81bcd173f7caec48911e39738d6b4dd60672d7fc))
* **issues:** add discussion commands ([6b3861c](https://github.com/linearis-oss/linearis/commit/6b3861cbfbdb6324270cda1a7977547e9253ff2e))
* **issues:** batch-resolve search filter identifiers ([963af95](https://github.com/linearis-oss/linearis/commit/963af954dbc286f755f93b740b36fcca4626a2c4)), closes [#63](https://github.com/linearis-oss/linearis/issues/63)
* **labels:** add issue label scope filters ([0c1874a](https://github.com/linearis-oss/linearis/commit/0c1874aad8cbadf6e4d729ad0940f1f3bcdd4106)), closes [#116](https://github.com/linearis-oss/linearis/issues/116)
* **projects:** add discussion commands ([ff64f2e](https://github.com/linearis-oss/linearis/commit/ff64f2edd7ceb5cdbc34de405b984582c86687d9))
* **reactions:** add shared service ([0a29bb1](https://github.com/linearis-oss/linearis/commit/0a29bb1f6208a2ddb093f458a7d12d70a645ac91)), closes [#83](https://github.com/linearis-oss/linearis/issues/83)

### Bug Fixes

* **ci:** rerun validation when PR base changes ([e92b7ca](https://github.com/linearis-oss/linearis/commit/e92b7cad13e667f25d2f2bc02901e50f94646a66))
* **comments:** constrain compatibility replies ([85a1d3a](https://github.com/linearis-oss/linearis/commit/85a1d3a1e2e1ecf46138632d637f00b046a1c12c))
* **deps:** update dependency @linear/sdk to v82 ([7e62fda](https://github.com/linearis-oss/linearis/commit/7e62fdacb56b9e14963303bb76dbd67a7056f554))
* **issues:** honor explicit completed status filters ([607c954](https://github.com/linearis-oss/linearis/commit/607c954bb861519c9be5b5499c07844262b2b8de)), closes [#179](https://github.com/linearis-oss/linearis/issues/179)
* resolve issue estimate team context via team resolver ([9c94ff9](https://github.com/linearis-oss/linearis/commit/9c94ff9fc5677e15380e94500933888a76f08e1d))

## [2026.4.9-next.8](https://github.com/linearis-oss/linearis/compare/v2026.4.9-next.7...v2026.4.9-next.8) (2026-04-27)

### Bug Fixes

* **comments:** constrain compatibility replies ([85a1d3a](https://github.com/linearis-oss/linearis/commit/85a1d3a1e2e1ecf46138632d637f00b046a1c12c))

## [2026.4.9-next.7](https://github.com/linearis-oss/linearis/compare/v2026.4.9-next.6...v2026.4.9-next.7) (2026-04-27)

### Features

* **cli:** add reaction workflows ([4d6a00c](https://github.com/linearis-oss/linearis/commit/4d6a00cbd9a2c9abe407d5071f3ccd5bbb81e01e)), closes [#83](https://github.com/linearis-oss/linearis/issues/83)
* **emoji:** add reaction input normalization ([bc82bc6](https://github.com/linearis-oss/linearis/commit/bc82bc6fa3e7c6ee64f6581b80206ec85bf8e9a8)), closes [#83](https://github.com/linearis-oss/linearis/issues/83)
* **graphql:** add reaction operations ([bd0ffac](https://github.com/linearis-oss/linearis/commit/bd0ffaccdba8659fedb6ae4074dc737e102b63b8)), closes [#83](https://github.com/linearis-oss/linearis/issues/83)
* **reactions:** add shared service ([0a29bb1](https://github.com/linearis-oss/linearis/commit/0a29bb1f6208a2ddb093f458a7d12d70a645ac91)), closes [#83](https://github.com/linearis-oss/linearis/issues/83)

## [2026.4.9-next.6](https://github.com/linearis-oss/linearis/compare/v2026.4.9-next.5...v2026.4.9-next.6) (2026-04-27)

### Bug Fixes

* **ci:** rerun validation when PR base changes ([e92b7ca](https://github.com/linearis-oss/linearis/commit/e92b7cad13e667f25d2f2bc02901e50f94646a66))
* resolve issue estimate team context via team resolver ([9c94ff9](https://github.com/linearis-oss/linearis/commit/9c94ff9fc5677e15380e94500933888a76f08e1d))

## [2026.4.9-next.5](https://github.com/linearis-oss/linearis/compare/v2026.4.9-next.4...v2026.4.9-next.5) (2026-04-27)

### Bug Fixes

* **deps:** update dependency @linear/sdk to v82 ([7e62fda](https://github.com/linearis-oss/linearis/commit/7e62fdacb56b9e14963303bb76dbd67a7056f554))

## [2026.4.9-next.4](https://github.com/linearis-oss/linearis/compare/v2026.4.9-next.3...v2026.4.9-next.4) (2026-04-25)

### Features

* **comments:** deprecate compatibility facade ([d097eee](https://github.com/linearis-oss/linearis/commit/d097eeee62dfa5446c866644ded70a779346b7e4))
* **discussions:** add GraphQL and service layer ([1ae10e1](https://github.com/linearis-oss/linearis/commit/1ae10e1313722c58102c8269cc97886ed8891d8d))
* **initiatives:** add discussion commands ([81bcd17](https://github.com/linearis-oss/linearis/commit/81bcd173f7caec48911e39738d6b4dd60672d7fc))
* **issues:** add discussion commands ([6b3861c](https://github.com/linearis-oss/linearis/commit/6b3861cbfbdb6324270cda1a7977547e9253ff2e))
* **projects:** add discussion commands ([ff64f2e](https://github.com/linearis-oss/linearis/commit/ff64f2edd7ceb5cdbc34de405b984582c86687d9))

## [2026.4.9-next.3](https://github.com/linearis-oss/linearis/compare/v2026.4.9-next.2...v2026.4.9-next.3) (2026-04-25)

### Features

* **issues:** batch-resolve search filter identifiers ([963af95](https://github.com/linearis-oss/linearis/commit/963af954dbc286f755f93b740b36fcca4626a2c4)), closes [#63](https://github.com/linearis-oss/linearis/issues/63)

## [2026.4.9-next.2](https://github.com/linearis-oss/linearis/compare/v2026.4.9-next.1...v2026.4.9-next.2) (2026-04-24)

### Features

* **labels:** add issue label scope filters ([0c1874a](https://github.com/linearis-oss/linearis/commit/0c1874aad8cbadf6e4d729ad0940f1f3bcdd4106)), closes [#116](https://github.com/linearis-oss/linearis/issues/116)

## [2026.4.9-next.1](https://github.com/linearis-oss/linearis/compare/v2026.4.8...v2026.4.9-next.1) (2026-04-24)

### Bug Fixes

* **issues:** honor explicit completed status filters ([607c954](https://github.com/linearis-oss/linearis/commit/607c954bb861519c9be5b5499c07844262b2b8de)), closes [#179](https://github.com/linearis-oss/linearis/issues/179)

## [2026.4.8](https://github.com/linearis-oss/linearis/compare/v2026.4.7...v2026.4.8) (2026-04-23)

### Features

* **issues:** add discussion flags to issue read ([8e3608e](https://github.com/linearis-oss/linearis/commit/8e3608eb156a99045c48b6007921c94d240f6d81)), closes [#145](https://github.com/linearis-oss/linearis/issues/145)
* **labels:** add project label listing support ([99b8288](https://github.com/linearis-oss/linearis/commit/99b82882d96ec100a11165752d2e2ba403642eb6)), closes [#115](https://github.com/linearis-oss/linearis/issues/115)
* **projects:** add lifecycle commands ([80e89f7](https://github.com/linearis-oss/linearis/commit/80e89f760e60868526c2ce9575d311fa0b8fa18b)), closes [#141](https://github.com/linearis-oss/linearis/issues/141)
* **release:** add prerelease install guidance to promotion PR ([acca4a1](https://github.com/linearis-oss/linearis/commit/acca4a1b16486f83de58fbfb3c298699a417aff3))

### Bug Fixes

* abort timed-out GraphQL requests ([332da1e](https://github.com/linearis-oss/linearis/commit/332da1efd6c86a299ea5639b561bc8383013740c))
* **ci:** address review feedback for release and history guards ([db27e14](https://github.com/linearis-oss/linearis/commit/db27e148bc95acb610e8dea6471e14896e13be26))
* **ci:** avoid bash regex parser error in promotion metadata ([b42b0c2](https://github.com/linearis-oss/linearis/commit/b42b0c276871055f6ad1ff43cc8b8fa1373b0341))
* **ci:** avoid shell interpolation in promotion PR body ([c297307](https://github.com/linearis-oss/linearis/commit/c2973072f60a313227ef41f4f4acacda8d1919b9))
* **ci:** bind release job to npm-publish environment ([0339929](https://github.com/linearis-oss/linearis/commit/0339929663cf9bcc3c0be854a40b66cc40a8abd9))
* **ci:** escape markdown backticks in promotion PR body ([21d31c7](https://github.com/linearis-oss/linearis/commit/21d31c7b82711d62524645af602e4387dbf82356))
* **ci:** migrate release automation to GitHub App auth ([f0ba4e0](https://github.com/linearis-oss/linearis/commit/f0ba4e0c0a200b70ffa68c367ebce7829b1d29e4))
* **ci:** restore release trigger fallback for promotion PR ([0b358b1](https://github.com/linearis-oss/linearis/commit/0b358b17331bb2d7a047332d81a9f97bea9aadd0))
* **ci:** use deploy key for release automation git pushes ([5b42037](https://github.com/linearis-oss/linearis/commit/5b42037911b1cf44bfa71757326ecbeceee6d2a1))
* clear graphql timeout timers on all request paths ([1de7887](https://github.com/linearis-oss/linearis/commit/1de78871d52f106d9b7956f6eaa908f14395653b))
* **issues:** keep attachment reads on default comments ([ab6717d](https://github.com/linearis-oss/linearis/commit/ab6717d6f0d2687febea8081b7bd8639c9288962)), closes [#145](https://github.com/linearis-oss/linearis/issues/145)
* **issues:** keep mutation comment payload lean ([fbb373a](https://github.com/linearis-oss/linearis/commit/fbb373a6dcc8f3d5d109518331466e721a059a91))
* **issues:** restore default read comments ([5c33015](https://github.com/linearis-oss/linearis/commit/5c33015be63baef571c571f3cd76408aad1fdc4c)), closes [#145](https://github.com/linearis-oss/linearis/issues/145)
* **projects:** handle archived project archive lifecycle ([84ecd4e](https://github.com/linearis-oss/linearis/commit/84ecd4e69124cbd707e902a8e08750e47d19922a)), closes [#141](https://github.com/linearis-oss/linearis/issues/141)
* **projects:** handle nullable deleteProject entity ([f670ce1](https://github.com/linearis-oss/linearis/commit/f670ce181c326a39d6abb8371cea2bafcdf0d9f3)), closes [#141](https://github.com/linearis-oss/linearis/issues/141)
* **projects:** reject ambiguous project name resolution ([a76eafd](https://github.com/linearis-oss/linearis/commit/a76eafd6484fcf4cff50cd19dab2b6e92d5578e0)), closes [#141](https://github.com/linearis-oss/linearis/issues/141)
* **projects:** resolve archived names on delete ([52727e7](https://github.com/linearis-oss/linearis/commit/52727e7f2507d8908f82e71c8885d285a6a62285)), closes [#141](https://github.com/linearis-oss/linearis/issues/141)
* **projects:** restore archive mutation path ([4f123ef](https://github.com/linearis-oss/linearis/commit/4f123ef315772d8906ea821d4fd77fa61bba0e19)), closes [#141](https://github.com/linearis-oss/linearis/issues/141)
* **projects:** restore distinct archive mutation ([4f718d8](https://github.com/linearis-oss/linearis/commit/4f718d80417efb1e3a88c696f0aaf8a657236191)), closes [#141](https://github.com/linearis-oss/linearis/issues/141)
* **release:** classify promotion PR content by releasability ([a54ad22](https://github.com/linearis-oss/linearis/commit/a54ad225f361d504ba265f882bbea01a68dd2c8a))
* **release:** enforce calver-safe semantic-release behavior ([3f7ffb7](https://github.com/linearis-oss/linearis/commit/3f7ffb7c33f061551bc8d08b803b3b6382ee3c51))
* **release:** gate version bumps to deliverable-impact commits ([3744496](https://github.com/linearis-oss/linearis/commit/3744496dd88963333db00896019e9763660bf2bd))
* **release:** keep prerelease train on stable patch ([0964e75](https://github.com/linearis-oss/linearis/commit/0964e75113d6dbee13e2da5487c9ec08733334fc))
* **release:** make calver month rollover semantic-compatible ([d3ab35c](https://github.com/linearis-oss/linearis/commit/d3ab35ce2b795e0642b9719bf2823e0e2a1c1775))
* **release:** rely on defaults for releasable commit types ([4d3c0ad](https://github.com/linearis-oss/linearis/commit/4d3c0ad417ea0d98aa086ff3a821de170c348500))

## [2026.4.8-next.8](https://github.com/linearis-oss/linearis/compare/v2026.4.8-next.7...v2026.4.8-next.8) (2026-04-23)

### Features

* **projects:** add lifecycle commands ([80e89f7](https://github.com/linearis-oss/linearis/commit/80e89f760e60868526c2ce9575d311fa0b8fa18b)), closes [#141](https://github.com/linearis-oss/linearis/issues/141)

### Bug Fixes

* **projects:** handle archived project archive lifecycle ([84ecd4e](https://github.com/linearis-oss/linearis/commit/84ecd4e69124cbd707e902a8e08750e47d19922a)), closes [#141](https://github.com/linearis-oss/linearis/issues/141)
* **projects:** handle nullable deleteProject entity ([f670ce1](https://github.com/linearis-oss/linearis/commit/f670ce181c326a39d6abb8371cea2bafcdf0d9f3)), closes [#141](https://github.com/linearis-oss/linearis/issues/141)
* **projects:** reject ambiguous project name resolution ([a76eafd](https://github.com/linearis-oss/linearis/commit/a76eafd6484fcf4cff50cd19dab2b6e92d5578e0)), closes [#141](https://github.com/linearis-oss/linearis/issues/141)
* **projects:** resolve archived names on delete ([52727e7](https://github.com/linearis-oss/linearis/commit/52727e7f2507d8908f82e71c8885d285a6a62285)), closes [#141](https://github.com/linearis-oss/linearis/issues/141)
* **projects:** restore archive mutation path ([4f123ef](https://github.com/linearis-oss/linearis/commit/4f123ef315772d8906ea821d4fd77fa61bba0e19)), closes [#141](https://github.com/linearis-oss/linearis/issues/141)
* **projects:** restore distinct archive mutation ([4f718d8](https://github.com/linearis-oss/linearis/commit/4f718d80417efb1e3a88c696f0aaf8a657236191)), closes [#141](https://github.com/linearis-oss/linearis/issues/141)

## [2026.4.8-next.7](https://github.com/linearis-oss/linearis/compare/v2026.4.8-next.6...v2026.4.8-next.7) (2026-04-23)

### Features

* **issues:** add discussion flags to issue read ([8e3608e](https://github.com/linearis-oss/linearis/commit/8e3608eb156a99045c48b6007921c94d240f6d81)), closes [#145](https://github.com/linearis-oss/linearis/issues/145)
* **labels:** add project label listing support ([99b8288](https://github.com/linearis-oss/linearis/commit/99b82882d96ec100a11165752d2e2ba403642eb6)), closes [#115](https://github.com/linearis-oss/linearis/issues/115)

### Bug Fixes

* **ci:** avoid bash regex parser error in promotion metadata ([b42b0c2](https://github.com/linearis-oss/linearis/commit/b42b0c276871055f6ad1ff43cc8b8fa1373b0341))
* **issues:** keep attachment reads on default comments ([ab6717d](https://github.com/linearis-oss/linearis/commit/ab6717d6f0d2687febea8081b7bd8639c9288962)), closes [#145](https://github.com/linearis-oss/linearis/issues/145)
* **issues:** keep mutation comment payload lean ([fbb373a](https://github.com/linearis-oss/linearis/commit/fbb373a6dcc8f3d5d109518331466e721a059a91))
* **issues:** restore default read comments ([5c33015](https://github.com/linearis-oss/linearis/commit/5c33015be63baef571c571f3cd76408aad1fdc4c)), closes [#145](https://github.com/linearis-oss/linearis/issues/145)
* **release:** classify promotion PR content by releasability ([a54ad22](https://github.com/linearis-oss/linearis/commit/a54ad225f361d504ba265f882bbea01a68dd2c8a))
* **release:** enforce calver-safe semantic-release behavior ([3f7ffb7](https://github.com/linearis-oss/linearis/commit/3f7ffb7c33f061551bc8d08b803b3b6382ee3c51))
* **release:** gate version bumps to deliverable-impact commits ([3744496](https://github.com/linearis-oss/linearis/commit/3744496dd88963333db00896019e9763660bf2bd))
* **release:** make calver month rollover semantic-compatible ([d3ab35c](https://github.com/linearis-oss/linearis/commit/d3ab35ce2b795e0642b9719bf2823e0e2a1c1775))
* **release:** rely on defaults for releasable commit types ([4d3c0ad](https://github.com/linearis-oss/linearis/commit/4d3c0ad417ea0d98aa086ff3a821de170c348500))

## [2026.4.8-next.6](https://github.com/linearis-oss/linearis/compare/v2026.4.8-next.5...v2026.4.8-next.6) (2026-04-23)

### Bug Fixes

* **ci:** restore release trigger fallback for promotion PR ([0b358b1](https://github.com/linearis-oss/linearis/commit/0b358b17331bb2d7a047332d81a9f97bea9aadd0))

## [2026.4.8-next.5](https://github.com/linearis-oss/linearis/compare/v2026.4.8-next.4...v2026.4.8-next.5) (2026-04-23)

### Bug Fixes

* **ci:** bind release job to npm-publish environment ([0339929](https://github.com/linearis-oss/linearis/commit/0339929663cf9bcc3c0be854a40b66cc40a8abd9))

## [2026.4.8-next.4](https://github.com/linearis-oss/linearis/compare/v2026.4.8-next.3...v2026.4.8-next.4) (2026-04-23)

### Bug Fixes

* **ci:** avoid shell interpolation in promotion PR body ([c297307](https://github.com/linearis-oss/linearis/commit/c2973072f60a313227ef41f4f4acacda8d1919b9))

## [2026.4.8-next.3](https://github.com/linearis-oss/linearis/compare/v2026.4.8-next.2...v2026.4.8-next.3) (2026-04-23)

### Bug Fixes

* **ci:** escape markdown backticks in promotion PR body ([21d31c7](https://github.com/linearis-oss/linearis/commit/21d31c7b82711d62524645af602e4387dbf82356))

## [2026.4.8-next.2](https://github.com/linearis-oss/linearis/compare/v2026.4.8-next.1...v2026.4.8-next.2) (2026-04-23)

### Bug Fixes

* **ci:** address review feedback for release and history guards ([db27e14](https://github.com/linearis-oss/linearis/commit/db27e148bc95acb610e8dea6471e14896e13be26))

## [2026.4.8-next.1](https://github.com/linearis-oss/linearis/compare/v2026.4.7...v2026.4.8-next.1) (2026-04-23)

### Bug Fixes

* abort timed-out GraphQL requests ([332da1e](https://github.com/linearis-oss/linearis/commit/332da1efd6c86a299ea5639b561bc8383013740c))
* **ci:** migrate release automation to GitHub App auth ([f0ba4e0](https://github.com/linearis-oss/linearis/commit/f0ba4e0c0a200b70ffa68c367ebce7829b1d29e4))
* **ci:** use deploy key for release automation git pushes ([5b42037](https://github.com/linearis-oss/linearis/commit/5b42037911b1cf44bfa71757326ecbeceee6d2a1))
* clear graphql timeout timers on all request paths ([1de7887](https://github.com/linearis-oss/linearis/commit/1de78871d52f106d9b7956f6eaa908f14395653b))
* **release:** keep prerelease train on stable patch ([0964e75](https://github.com/linearis-oss/linearis/commit/0964e75113d6dbee13e2da5487c9ec08733334fc))

# Changelog

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## [2026.4.7] - 2026-04-22

[2026.4.7]: https://github.com/linearis-oss/linearis/compare/v2026.4.6...v2026.4.7

### Fixed

- Process now exits immediately after command completion to prevent hanging runs in automation workflows — thanks, [@eveld](https://github.com/eveld)! [PR#156](https://github.com/linearis-oss/linearis/pull/156)

---

## [2026.4.6] - 2026-04-21

[2026.4.6]: https://github.com/linearis-oss/linearis/compare/v2026.4.5...v2026.4.6

### Fixed

- enforce strict team-scale estimate validation for `issues create --estimate` and `issues update --estimate`, including hard fail when team estimates are disabled (`notUsed`)

---

## [2026.4.5] - 2026-04-19

[2026.4.5]: https://github.com/linearis-oss/linearis/compare/v2026.4.4...v2026.4.5

### Added

- **Initiatives domain support** — new `initiatives` command group with typed GraphQL operations, service layer CRUD/relation/project-link flows, resolver ID translation, and CLI usage metadata wiring
- **Issue attachments management** — new `attachments` command group (`list`, `create`, `delete`) and `issues read --with-attachments` for embedded issue attachment expansion [#55](https://github.com/linearis-oss/linearis/issues/55)
- **Reusable numeric option parsing** — shared integer parsers for issue CLI flags to standardize validation and option handling
- **Retry backoff for transient API failures** — exponential retry delays for retryable HTTP/GraphQL failures

### Fixed

- Initiatives GraphQL operations now align with current schema shape and pagination behavior for relation/link lookups
- Initiative command surface corrected for sorting and update/create signatures to match implementation constraints
- Issue create/update now validate `--priority` and `--estimate` values early before resolver/service calls
- Retry middleware now wraps only raw HTTP transport so retry classification inspects original status codes
- Auth error handling now discriminates empty catch paths explicitly for safer failure reporting

### CI & Build

- Added CI guard preventing accidental `docs/plans/*.md` history in PR branches
- Updated runtime dependency `@linear/sdk` to v81 and refreshed non-major dev dependencies

### Testing

- Expanded issue numeric validation test coverage and retry backoff timer coverage
- Added failing/coverage tests for multi-relation and initiative service/update flows

---

## [2026.4.4] - 2026-04-09

[2026.4.4]: https://github.com/linearis-oss/linearis/compare/v2026.4.3...v2026.4.4

### Changed

- Restored the dedicated `issues search <query>` subcommand while keeping `issues list --query <query>` as a deprecated compatibility path for one release window; both commands now share the same filter flags [#121](https://github.com/linearis-oss/linearis/issues/121), [PR#124](https://github.com/linearis-oss/linearis/pull/124)

### CI & Build

- Switched the publish workflow from `npm install` to `npm ci` for reproducible clean installs in CI [PR#122](https://github.com/linearis-oss/linearis/pull/122)

---

## [2026.4.3] - 2026-04-08

[2026.4.3]: https://github.com/linearis-oss/linearis/compare/v2026.4.2...v2026.4.3

### Added

- **Estimate support** — `--estimate` on `issues create`, and `--estimate`/`--clear-estimate` on `issues update` with scale-neutral descriptions and `--estimate 0` support [PR#94](https://github.com/linearis-oss/linearis/pull/94)

### Fixed

- Replaced `postinstall` with `prepare` to fix broken consumer installs via `npm install -g linearis` [#120](https://github.com/linearis-oss/linearis/issues/120), [PR#123](https://github.com/linearis-oss/linearis/pull/123)

### CI & Build

- Added `clean-publish` to strip dev artifacts from published tarball [PR#123](https://github.com/linearis-oss/linearis/pull/123)
- Added smoke test for consumer package install [PR#123](https://github.com/linearis-oss/linearis/pull/123)

### Documentation

- Updated contributing guide with publishing section and lifecycle hook policy [PR#123](https://github.com/linearis-oss/linearis/pull/123)

---

## [2026.4.2] - 2026-04-08

[2026.4.2]: https://github.com/linearis-oss/linearis/compare/v2026.4.1...v2026.4.2

### Added

- **Due date support** — `--due-date` option on `issues create`, and `--due-date`/`--clear-due-date` on `issues update` [PR#119](https://github.com/linearis-oss/linearis/pull/119)
- **Project CRUD commands** — new `project read`, `project create`, and `project update` commands with label and status ID resolution [PR#118](https://github.com/linearis-oss/linearis/pull/118)
- **Comment management** — new `comments list`, `comments reply`, `comments edit`, and `comments delete` subcommands [PR#81](https://github.com/linearis-oss/linearis/pull/81)
- **XDG_CONFIG_HOME support** — token storage now respects `XDG_CONFIG_HOME` on Linux [#73](https://github.com/linearis-oss/linearis/issues/73)
- **GitHub release automation** — publish workflow now creates GitHub releases automatically [PR#77](https://github.com/linearis-oss/linearis/pull/77)

### Fixed

- Migrated `moduleResolution` from `Node` to `Bundler` for TypeScript 6 compatibility [PR#107](https://github.com/linearis-oss/linearis/pull/107)
- Added `prepack` script for git-based installs [PR#80](https://github.com/linearis-oss/linearis/pull/80)
- Updated `@linear/sdk` to v80 [PR#109](https://github.com/linearis-oss/linearis/pull/109)
- Updated `commander` to v14.0.3 [PR#103](https://github.com/linearis-oss/linearis/pull/103)

### Changed

- Standardized delete return types to `{id, success}` across all delete operations [PR#86](https://github.com/linearis-oss/linearis/pull/86)

### CI & Build

- Expanded CI matrix to test Node.js 22 and 24 [PR#112](https://github.com/linearis-oss/linearis/pull/112)
- Pinned publish workflow to minimum supported Node version [PR#113](https://github.com/linearis-oss/linearis/pull/113)
- Aligned action versions to v6 across CI and publish workflows [PR#92](https://github.com/linearis-oss/linearis/pull/92)
- Added content permission to CI workflow [PR#99](https://github.com/linearis-oss/linearis/pull/99)
- Added CODEOWNERS file for security review gates

### Maintenance

- Updated TypeScript to v6, Vitest to v4, `@types/node` to v24
- Updated dev dependencies (non-major)
- Disabled Renovate dependency dashboard
- Updated `.gitignore` to exclude generated files
- Removed obsolete mise config and tasks

### Documentation

- Replaced manual contributor list with contrib.rocks [PR#102](https://github.com/linearis-oss/linearis/pull/102)

---

## [2026.4.1] - 2026-04-07

[2026.4.1]: https://github.com/linearis-oss/linearis/compare/v2025.12.3...v2026.4.1

### Breaking Changes

- **Complete architecture rewrite** to a strict five-layer architecture: CLI Input → Command → Resolver → Service → JSON Output. [#45](https://github.com/linearis-oss/linearis/issues/45), [#27](https://github.com/linearis-oss/linearis/issues/27), [#43](https://github.com/linearis-oss/linearis/issues/43), [#47](https://github.com/linearis-oss/linearis/issues/47), [PR#49](https://github.com/linearis-oss/linearis/pull/49)
- **`embeds` commands renamed to `files`** — `embeds download` → `files download`, `embeds upload` → `files upload`
- **`project-milestones` commands renamed to `milestones`**
- **`search` subcommands merged into `list`** — use `issues list --status ...` instead of `issues search --status ...`

### Added

- **Encrypted token authentication** — `linearis auth login` opens Linear in the browser and stores the token encrypted in `~/.linearis/token`. New subcommands: `auth login`, `auth status`, `auth logout`
- **Issue relation flags** — `--blocks`, `--blocked-by`, `--relates-to` on issue update
- **Cursor pagination** — `--after` and `--limit` flags on all list commands
- **Assignee resolution** — `--assignee` flag resolves by name or email
- **`usage` subcommand** on every command group for self-documenting CLI help
- **Request timeouts** — GraphQL API requests time out after 30 seconds, file download/upload after 60 seconds. Prevents indefinite hangs, especially important for LLM agent tool timeouts
- **GraphQL Code Generator pipeline** — queries and mutations defined in `.graphql` files under `graphql/`, codegen produces typed DocumentNodes
- **Biome** for formatting and linting (replaces previous setup)
- **Lefthook** git hooks with **commitlint** for conventional commit enforcement
- **Security policy** (`SECURITY.md`) with responsible disclosure process
- **GitHub community templates** — bug report form, feature request form, PR template

### Fixed

- File download and upload commands now use proper error exit codes (exit 1) on failure instead of returning exit code 0 with a success envelope

### Documentation

- Complete documentation rewrite for v2 architecture
- New docs: `architecture.md`, `development.md`, `testing.md`, `build-system.md` with layer invariants, mock patterns, and service/resolver/command templates
- `AGENTS.md` restructured for machine-first readability with decision trees and anti-patterns
- `README.md` rewritten for current CLI commands and agent optimization
- `CONTRIBUTING.md` expanded with dev setup, testing, and architecture pointer
- Removed obsolete 26k-line GraphQL schema dump and completed implementation plans

---

## [2025.12.3] - 2025-12-11

[2025.12.3]: https://github.com/czottmann/linearis/compare/v2025.12.2...v2025.12.3

### Fixed

- Version string now read from `package.json` instead of being hardcoded

---

## [2025.12.2] - 2025-12-11

[2025.12.2]: https://github.com/czottmann/linearis/compare/v2025.11.3...v2025.12.2

### Added

- New `embeds upload` command to upload files to Linear storage – thanks, [@chadrwalters](https://github.com/chadrwalters)! [PR#23](https://github.com/czottmann/linearis/pull/23)
- New `documents` commands for Linear document management – thanks, [@ralfschimmel](https://github.com/ralfschimmel)! [PR#21](https://github.com/czottmann/linearis/pull/21)
- `issues` commands now include the `branchName` field (the git branch name associated with the issue). [#14](https://github.com/czottmann/linearis/issues/14) <!-- ZCO-1629 -->
- Diagnostic output for issue transform errors, showing raw API response and stack trace to help debug null field issues. [#6](https://github.com/czottmann/linearis/issues/6) <!-- ZCO-1630 -->

### Breaking Changes

- **Issue "status" flag renamed**: `--state`/`--states` options renamed to `--status` for consistency with Linear's UI terminology. Thanks for the (appreciated but ultimately unused) PR, [@ralfschimmel](https://github.com/ralfschimmel)! <!-- ZCO-1641 -->
  - `issues search --states` → `--status` (still accepts comma-separated values)
  - `issues update --state` → `--status` (short flag `-s` unchanged)

### Tooling

- Prepublish validation to ensure `dist/main.js` exists and is executable before publishing to npm <!-- ZCO-1604 -->
- Cleaned up the tiny `pnpm` vs `npm` mess, it's now `npm` all the things <!-- ZCO-1603 -->

---

## [2025.11.3] - 2025-11-20

[2025.11.3]: https://github.com/czottmann/linearis/compare/2025.11.2...v2025.11.3

### Added

- New `teams` command with `list` subcommand 🎉 – thanks, [@chadrwalters](https://github.com/chadrwalters)! [PR#13](https://github.com/czottmann/linearis/pull/13)
  - Lists all teams in workspace with id, key, name, and description
  - Results sorted alphabetically by name
- New `users` command with `list` subcommand [PR#13](https://github.com/czottmann/linearis/pull/13)
  - Lists all users with id, name, displayName, email, and active status
  - Supports `--active` flag to filter for active users only
  - Results sorted alphabetically by name
- Integration tests for teams and users commands [PR#13](https://github.com/czottmann/linearis/pull/13)

### Fixed

- GraphQL orderBy error resolved by implementing client-side sorting for teams and users list commands [PR#13](https://github.com/czottmann/linearis/pull/13)
- Project name matching is now case-insensitive (using `eqIgnoreCase`) for better UX [PR#13](https://github.com/czottmann/linearis/pull/13)

### Documentation

- Added "Teams & Users" section to README.md with usage examples
- Updated docs/architecture.md, docs/development.md, and docs/files.md to reference new commands

---

## [2025.11.2] - 2025-11-11

[2025.11.2]: https://github.com/czottmann/linearis/compare/2025.11.1...2025.11.2

### Added

- New `cycles` and `project-milestones` commands 🎉 – thanks, [Ryan](https://github.com/ryanrozich)! [PR#7](https://github.com/czottmann/linearis/pull/7)
- The `issues` commands now include parent and child issue relationships <!-- ZCO-1574, ZCO-1586 -->
  - `parentIssue` field with `{ id, identifier, title }` for parent issue (if exists)
  - `subIssues` array with `{ id, identifier, title }` for immediate child issues
  - Available in all issue commands: `read`, `list`, and `search`

### Fixed

- `issues` commands' embed parser now correctly ignores markdown URLs inside code blocks and inline code <!-- ZCO-1587 -->
  - Previously extracted URLs from code examples and documentation
  - Ensures only actual embedded files are detected, not code examples
- All date/time fields now output in ISO 8601 format (`2025-11-09T23:00:00.000Z`) instead of verbose JavaScript date strings <!-- ZCO-1577 -->
- Under-the-hood stability bug fixes.

---

## [2025.11.1] - 2025-11-06

[2025.11.1]: https://github.com/czottmann/linearis/compare/1.1.0...2025.11.1

### Added

- `issues` commands' results now include `embeds` array containing tickets' file embeds
  - Embed extraction from issue descriptions and comments
    - Parses markdown for Linear upload URLs (`![label](url)` and `[label](url)`)
    - Returns `embeds` array in `issues read` command output
    - Each embed includes `label`, `url`, and `expiresAt` (ISO 8601 timestamp)
- New `embeds` command group for downloading embedded files from Linear's cloud storage
  - `embeds download <url>` command to download files
    - `--output <path>` option for custom output location
    - `--overwrite` flag to replace existing files
    - Automatic directory creation for output paths

### Documentation

- Renamed CLAUDE.md to AGENTS.md, re-added CLAUDE.md as a symlink
- Updated AGENTS.md with file download features and signed URL documentation
- Added File Downloads section to README.md with usage examples
- Updated docs/files.md with new command and utility files
- Added embeds command flow and extraction flow diagrams to documentation

---

## [1.1.0] - 2025-10-21

[1.1.0]: https://github.com/czottmann/linearis/compare/1.0.0...1.1.0

### Fixes

- Updated CLI program name from "linear" to "linearis" for consistency with project name

### Documentation

- Added section "Example rule for your LLM agent of choice" to README

---

## [1.0.0] - 2025-10-21

[1.0.0]: https://github.com/czottmann/linearis/releases/tag/1.0.0

### Added

- Initial release of Linearis CLI tool
