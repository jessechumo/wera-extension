# Changelog

## [0.11.0](https://github.com/jessechumo/wera-extension/compare/wera-extension-v0.10.0...wera-extension-v0.11.0) (2026-10-31)


### Features

* **autofill:** attach the resume and cover letter on Jobvite ([ee23cb4](https://github.com/jessechumo/wera-extension/commit/ee23cb46a58efd8f872e75f3b1e5561e77f97caa))
* correct answers on more application systems, and what comes after applying ([e8c1c98](https://github.com/jessechumo/wera-extension/commit/e8c1c9880a511d9239b929c8193d345a484f1434))
* **detect:** carry "Apply with Wera" through Workday, Oracle and iCIMS ([fd3a489](https://github.com/jessechumo/wera-extension/commit/fd3a48937ecee04e9258f3c5437443f0dc301c22))
* **detect:** read iCIMS postings and Apply buttons in other languages ([7ccd4c6](https://github.com/jessechumo/wera-extension/commit/7ccd4c6321bb12ea3cb6eec05f8c509a97c0f943))
* **panel:** answer follow-up questions from the question before them ([9468a9d](https://github.com/jessechumo/wera-extension/commit/9468a9d1a86543f7e99b01c3194def544fc1cf5e))
* **panel:** enter all of Wera's guesses with one click ([1ddd13c](https://github.com/jessechumo/wera-extension/commit/1ddd13cacba9a14bf7fcdf6f9b463d5871d2c74c))
* **panel:** offer the next best match after applying ([985c3ce](https://github.com/jessechumo/wera-extension/commit/985c3ce239c48a0bd1f769252a9e36960d3bd042))
* **panel:** say when a site wants an account, and fill once past it ([42fa39f](https://github.com/jessechumo/wera-extension/commit/42fa39f24aefe560aef0cd49b5217262409d72df))


### Bug Fixes

* **autofill:** know a start date however it is asked ([d5e8e6d](https://github.com/jessechumo/wera-extension/commit/d5e8e6d40f396f47238a9c9c488ce1f122ba4d54))
* **autofill:** never call one degree another ([5edd7ea](https://github.com/jessechumo/wera-extension/commit/5edd7eae22343788da4dcb79638344ab24e95dc8))
* **autofill:** never take a namesake address from a search box ([bc4a51a](https://github.com/jessechumo/wera-extension/commit/bc4a51ae501d1f8a00974e73a87b0310aef85ee1))
* **autofill:** read a question through "e.g." and "U.S." ([29f1ac7](https://github.com/jessechumo/wera-extension/commit/29f1ac7095aeda59401139be4f193bf9ffdd8352))
* **autofill:** stop freezing the page on Workable ([8a3dbca](https://github.com/jessechumo/wera-extension/commit/8a3dbca9363aa1d0b3f90151120857a548070a29))
* **panel:** keep the page's address on a job the AI read ([44d34da](https://github.com/jessechumo/wera-extension/commit/44d34da1280193f285262568bb6ab72282500bca))


### Documentation

* **readme:** add follow-ups, sign-in walls, next match and new site rules ([edc1524](https://github.com/jessechumo/wera-extension/commit/edc1524e014e3a71ed005debda936da149f90e60))

## [0.10.0](https://github.com/jessechumo/wera-extension/compare/wera-extension-v0.9.0...wera-extension-v0.10.0) (2026-10-31)


### Features

* **panel:** apply from the posting, see why a job fits, tailor in one click ([#66](https://github.com/jessechumo/wera-extension/issues/66)) ([3cf4987](https://github.com/jessechumo/wera-extension/commit/3cf4987fbfe59e2bb5d567a0ac7fc8e7a12c11c8))
* stay off pages with no job, obey no traps for AI tools, fill smarter and apply in one press ([a6e36a3](https://github.com/jessechumo/wera-extension/commit/a6e36a31c4d23a9be15a3abb82512aeb55d1ebb2))
* **traps:** obey nothing a job page says to AI tools ([#62](https://github.com/jessechumo/wera-extension/issues/62)) ([e582130](https://github.com/jessechumo/wera-extension/commit/e5821309179b40ed86005dfd88acb771fff61936))


### Bug Fixes

* **classify:** fill a detail only where a label asks for just that ([#63](https://github.com/jessechumo/wera-extension/issues/63)) ([31ec654](https://github.com/jessechumo/wera-extension/commit/31ec654b9341a0394460617ab8c4fe9720d43d3f))
* **deps:** bump lucide-react ([#64](https://github.com/jessechumo/wera-extension/issues/64)) ([25b96cd](https://github.com/jessechumo/wera-extension/commit/25b96cdbee4f0716aa0abcd5640ab19bb4a89253))
* **detect:** show Wera only on positive evidence of a job ([#61](https://github.com/jessechumo/wera-extension/issues/61)) ([ef1cad3](https://github.com/jessechumo/wera-extension/commit/ef1cad3da7c822b9d88040bef9985de837d79c3c))

## [0.9.0](https://github.com/jessechumo/wera-extension/compare/wera-extension-v0.8.0...wera-extension-v0.9.0) (2026-10-28)


### Features

* remember answers on submit, write cover letters, never reuse another company's answer ([#58](https://github.com/jessechumo/wera-extension/issues/58)) ([45e0bed](https://github.com/jessechumo/wera-extension/commit/45e0bed15bbeabd88751b2e9aaa69e671da56c2f))

## [0.8.0](https://github.com/jessechumo/wera-extension/compare/wera-extension-v0.7.0...wera-extension-v0.8.0) (2026-10-28)


### Features

* stay off non-job pages; alert after applying, then close the tab ([#55](https://github.com/jessechumo/wera-extension/issues/55)) ([8028de7](https://github.com/jessechumo/wera-extension/commit/8028de740d035031b4a8ea6f411b4fd5880b3f4b))

## [0.7.0](https://github.com/jessechumo/wera-extension/compare/wera-extension-v0.6.0...wera-extension-v0.7.0) (2026-10-24)


### Features

* fill what Wera already knows, clear errors, diagnostics and a cleaner codebase ([#52](https://github.com/jessechumo/wera-extension/issues/52)) ([1f9acb2](https://github.com/jessechumo/wera-extension/commit/1f9acb2a3d7c262e1b13398a4d94d0ed1b9da587))


### Bug Fixes

* **deps:** bump lucide-react ([#50](https://github.com/jessechumo/wera-extension/issues/50)) ([cf35227](https://github.com/jessechumo/wera-extension/commit/cf35227dc2b0d2572e126304c372cd532f5176bc))

## [0.6.0](https://github.com/jessechumo/wera-extension/compare/wera-extension-v0.5.2...wera-extension-v0.6.0) (2026-10-22)


### Features

* **content:** site rules for Workday, Greenhouse, Lever and Ashby ([4a868ab](https://github.com/jessechumo/wera-extension/commit/4a868ab40f2e4e089a0bcad50e00067383f6d587))
* one Wera panel in the page replaces the side panel and the dock ([7f3a68b](https://github.com/jessechumo/wera-extension/commit/7f3a68b49a8c4de3f75f3d6289cad9be95a61abc))
* one Wera panel in the page, site rules, and the Wera button ([fcde353](https://github.com/jessechumo/wera-extension/commit/fcde3535b338876f9e199debb2982e49790bc7d6))
* **page:** the Wera button in open questions ([b12988e](https://github.com/jessechumo/wera-extension/commit/b12988ef1654f3fc1e8b0f4e9e7efe2342a1a866))


### Bug Fixes

* **content:** look site rules up afresh for each field ([426eed7](https://github.com/jessechumo/wera-extension/commit/426eed72a74b6e83c42ee3698e5f6556cd4ecfdd))
* **content:** tell job applications from contact, demo and checkout forms ([de4b495](https://github.com/jessechumo/wera-extension/commit/de4b495d68e6f1e70996a04caf5f66c0e792fec6))
* **panel:** open when an application loads after the page ([fb50f9c](https://github.com/jessechumo/wera-extension/commit/fb50f9ccfcbf9a3d983dc6eed8c4b29b97cc77ec))


### Documentation

* describe the Wera panel, site rules and the Wera button ([901d859](https://github.com/jessechumo/wera-extension/commit/901d859e5d96a8abb6163803e02b034f8d5fb2ff))

## [0.5.2](https://github.com/jessechumo/wera-extension/compare/wera-extension-v0.5.1...wera-extension-v0.5.2) (2026-10-22)


### Bug Fixes

* **autofill:** never fill or keep a start date that has passed ([ede51f8](https://github.com/jessechumo/wera-extension/commit/ede51f888bbd3aede67dc9c59e3f20f1da40551b))
* dock on Greenhouse job boards, faster dock, no past start dates ([1a10d90](https://github.com/jessechumo/wera-extension/commit/1a10d90a293d9d09372602bd78cc8b823d286791))
* **launcher:** keep the dock on pages that rebuild themselves, and show it sooner ([4b79411](https://github.com/jessechumo/wera-extension/commit/4b79411546cea15ed64eeb1256eccc36874e7099))

## [0.5.1](https://github.com/jessechumo/wera-extension/compare/wera-extension-v0.5.0...wera-extension-v0.5.1) (2026-10-22)


### Bug Fixes

* extension reload errors and the doubled side panel logo ([f2aee29](https://github.com/jessechumo/wera-extension/commit/f2aee29f7a4f52c11726bafddae82e8d9174b916))
* **sidepanel:** drop the logo Chrome's panel bar already shows ([1f80954](https://github.com/jessechumo/wera-extension/commit/1f8095482b72e5e79b1524bbf66a757ebe8d4515))
* stop quietly when the extension is reloaded under an open tab ([c37a310](https://github.com/jessechumo/wera-extension/commit/c37a3107189acce9d9ffb754b395ec883c07e592))

## [0.5.0](https://github.com/jessechumo/wera-extension/compare/wera-extension-v0.4.1...wera-extension-v0.5.0) (2026-10-22)


### Features

* follow the theme picked in the Wera dashboard ([b5815bb](https://github.com/jessechumo/wera-extension/commit/b5815bbb8ebf62e5ca022a2f30f47dcb535c9676))


### Bug Fixes

* fill Workday's search boxes, popup lists and date parts ([4f7f505](https://github.com/jessechumo/wera-extension/commit/4f7f5056214eb46631eb77af707f425912f0551e))
* leave follow-up questions alone, read accented labels ([23898ac](https://github.com/jessechumo/wera-extension/commit/23898ace4b41d0386c4faa90f67ae874f70d891b))
* remember self-identification the user answers on a form ([49de47a](https://github.com/jessechumo/wera-extension/commit/49de47a347a4324c11bf5a1a5710c08198bec927))
* side panel buttons and score ring look like the dashboard's ([5b08a33](https://github.com/jessechumo/wera-extension/commit/5b08a33b7e83dad4267378e6702920635b991dda))
* the dock on job pages wears Wera's design ([9ea1fd2](https://github.com/jessechumo/wera-extension/commit/9ea1fd288c766bb3915eecab52462e0cea99218c))


### Performance

* autofill without the waiting ([c19aac6](https://github.com/jessechumo/wera-extension/commit/c19aac6e72d8ebd697c2db1ba1445d4edf54c4b1))


### Documentation

* describe the dashboard theme, self-identification and Workday handling ([bdc5793](https://github.com/jessechumo/wera-extension/commit/bdc579363cf35ade3046f8f8a6382f46a9b44fcd))

## [0.4.1](https://github.com/jessechumo/wera-extension/compare/wera-extension-v0.4.0...wera-extension-v0.4.1) (2026-10-22)


### Bug Fixes

* fill everything Wera knows, the way a person would ([ea769cd](https://github.com/jessechumo/wera-extension/commit/ea769cde4753530bb5b4ef20f7ddb64b893615c8))

## [0.4.0](https://github.com/jessechumo/wera-extension/compare/wera-extension-v0.3.0...wera-extension-v0.4.0) (2026-10-21)


### Features

* one big Autofill button, and fill jobs into Wera ([86ae999](https://github.com/jessechumo/wera-extension/commit/86ae999d45f9a7b9e7ca34f9afa652b91e1ae7a3))
* put the cover letter and resume into the application ([391cde6](https://github.com/jessechumo/wera-extension/commit/391cde61bd61aa51b272dbbe0feae4a3aff731ed))
* spot job pages on any site and slide in the Wera dock ([dbaa44a](https://github.com/jessechumo/wera-extension/commit/dbaa44a8d554f05e5beadba2b600d5b73405d96d))


### Bug Fixes

* send each page request to its frame only ([8d4472c](https://github.com/jessechumo/wera-extension/commit/8d4472c381218d1ac4eec05166936a218f7c0bd4))

## [0.3.0](https://github.com/jessechumo/wera-extension/compare/wera-extension-v0.2.2...wera-extension-v0.3.0) (2026-10-20)


### Features

* **api:** client calls for saved answers, page suggestions, runs and resumes ([e949e47](https://github.com/jessechumo/wera-extension/commit/e949e4777793fc9ae60763b3e3a54c2d61a61ae7))
* **content:** plan a form page and fill only the approved values ([f93c21b](https://github.com/jessechumo/wera-extension/commit/f93c21b3339e0c69d211031b34666b58d170244f))
* guided autofill, Wera button, multi-page continue, resume editor ([a0d229f](https://github.com/jessechumo/wera-extension/commit/a0d229f46e1940d3f2bf554f039168298095ade2))
* guided autofill, Wera button, multi-page continue, resume editor ([7de1d98](https://github.com/jessechumo/wera-extension/commit/7de1d98def89bf026ca2db61351303b580c64602))
* **launcher:** show a Wera button on job pages ([7d7e740](https://github.com/jessechumo/wera-extension/commit/7d7e740bf713dee00a6162f3e4f3c54a4dc2d0a2))
* **letter:** choose the tone and length, and say what to stress ([f54e91d](https://github.com/jessechumo/wera-extension/commit/f54e91d4711c6921b52006eb19daabda292c0477))
* **resume:** create and edit your resume (CV) in the panel ([96dc9cf](https://github.com/jessechumo/wera-extension/commit/96dc9cfaccb7fb604016910f588b3fd3ed65db67))
* **sidepanel:** review every field before Wera fills it, then continue page by page ([9ad08f1](https://github.com/jessechumo/wera-extension/commit/9ad08f1e20cdd786d4b853bbf23ee0825df9e5b4))
* **sidepanel:** settings for the Wera button, AI suggestions and learning ([e960103](https://github.com/jessechumo/wera-extension/commit/e96010313d982fdf5df6ede13533130179638914))


### Bug Fixes

* autofill races found by CI ([8cb1d0a](https://github.com/jessechumo/wera-extension/commit/8cb1d0a429cbd59965c00777b5b80bcb48174452))
* **background:** register the Wera button one sync at a time ([8345357](https://github.com/jessechumo/wera-extension/commit/83453576b0aaa1bfc8a9688a06ac0ae72573fb08))
* **sidepanel:** wait for an embedded form instead of filling the page around it ([1d6a21b](https://github.com/jessechumo/wera-extension/commit/1d6a21b2c7df01a144e61b9eeaed38c3c3640495))


### Documentation

* describe guided autofill, the Wera button, learning and the resume editor ([b8a4f38](https://github.com/jessechumo/wera-extension/commit/b8a4f380a35e160b8156b3efa71dba39b05ecc25))

## [0.2.2](https://github.com/jessechumo/wera-extension/compare/wera-extension-v0.2.1...wera-extension-v0.2.2) (2026-10-19)


### Documentation

* redraw architecture diagrams with logos and legends ([d312a4e](https://github.com/jessechumo/wera-extension/commit/d312a4eb7beda65c9f810d8f1faa0ea9a86868bb))
* redraw architecture diagrams with logos and legends ([d80d337](https://github.com/jessechumo/wera-extension/commit/d80d3376f6bb0f48ba3702c3faf0c83df8edaeb4))

## [0.2.1](https://github.com/jessechumo/wera-extension/compare/wera-extension-v0.2.0...wera-extension-v0.2.1) (2026-10-19)


### Bug Fixes

* **content:** answer the side panel when filling a form fails ([f5a9f99](https://github.com/jessechumo/wera-extension/commit/f5a9f999825ad622c0431c8573f3b80b9c16a1a7))


### Documentation

* add a contributing guide and editorconfig ([300fbbe](https://github.com/jessechumo/wera-extension/commit/300fbbeeb794ccef6a875f08426a9e01c8c7321b))
* **diagrams:** redraw the architecture diagrams in Excalidraw ([ca0fb77](https://github.com/jessechumo/wera-extension/commit/ca0fb7731bf217905ea36be39e816f0cc08b9e90))

## [0.2.0](https://github.com/jessechumo/wera-extension/compare/wera-extension-v0.1.0...wera-extension-v0.2.0) (2026-10-17)


### Features

* add the Wera icon in every size Chrome needs ([215a8a1](https://github.com/jessechumo/wera-extension/commit/215a8a181aaf6b46bf5e5be936225ca60c24e312))
* **apply:** add missing details in place and draft answers for the posting ([630998a](https://github.com/jessechumo/wera-extension/commit/630998aa679fcb78f8d978f510c7a8e08d8cbee7))
* **background:** keyboard shortcuts and a fill menu item ([feebb9f](https://github.com/jessechumo/wera-extension/commit/feebb9f8da49ab1a79b9d4267a650d18578167c5))
* **brand:** use the dashboard's logo and wordmark font ([6fc58fd](https://github.com/jessechumo/wera-extension/commit/6fc58fdbaf2cdec59009b394bdbc635be73c84d0))
* connect the extension to the Wera dashboard ([fcf77f9](https://github.com/jessechumo/wera-extension/commit/fcf77f9040ea1bc2728996ea816b09a63ba935da))
* **content:** fill dependent fields, custom dropdowns and checked values ([c4846b4](https://github.com/jessechumo/wera-extension/commit/c4846b4e4ef765bb0fac8a8005e46e3a4bf4f35e))
* **content:** fill forms in embedded frames and shadow roots ([4f66c85](https://github.com/jessechumo/wera-extension/commit/4f66c85e07e675034bf73dac9c9ecc78e2dcc1f7))
* **content:** fill forms in embedded frames and shadow roots ([eb48ed8](https://github.com/jessechumo/wera-extension/commit/eb48ed8ec32ee81fc67fb81b4de355b04589be4d))
* **content:** notice new form steps and submitted applications ([7ba4a5f](https://github.com/jessechumo/wera-extension/commit/7ba4a5f27413f827741c7ca161184bf3c264239f))
* **content:** read job pages and fill application forms ([a3f804b](https://github.com/jessechumo/wera-extension/commit/a3f804b9547eaeb96d4cdd2a7fd2209bc171a53e))
* **resume:** use Wera's tailored one-page resumes in the side panel ([6bf358d](https://github.com/jessechumo/wera-extension/commit/6bf358da6216a60a6225f7426ec117edfffe2415))
* **resume:** use Wera's tailored one-page resumes in the side panel ([6a38a1a](https://github.com/jessechumo/wera-extension/commit/6a38a1af2dc7949dc3c89cd25951738d73ce7e5d))
* **shared:** tracker status, H-1B data and a local answer memory ([67827b7](https://github.com/jessechumo/wera-extension/commit/67827b753f624d67468e8f61016a9e816a2ad8d4))
* **sidepanel:** add the side panel: sign in, job, apply, letter, resume ([49ff2e5](https://github.com/jessechumo/wera-extension/commit/49ff2e57f4145db8894ff876c5dcfd341e1a7138))
* **sidepanel:** clearer job card, a no-job state and tab markers ([ab344d7](https://github.com/jessechumo/wera-extension/commit/ab344d7f4bfe7bf59fda5428852ae8da25f8a25b))
* **sidepanel:** clearer job card, a no-job state and tab markers ([9af4117](https://github.com/jessechumo/wera-extension/commit/9af4117af2fbb35cf66f110ab0f68080bcaa3c68))
* **sidepanel:** fill each step, mark applied, reuse answers, H-1B ([9583e65](https://github.com/jessechumo/wera-extension/commit/9583e6575310d2f0f2eae49174047cf829249722))
* **sidepanel:** follow reloads and in-page navigation ([8c7a326](https://github.com/jessechumo/wera-extension/commit/8c7a32693d4a41d1b6ac1873c0a36822b5270549))
* **sidepanel:** keep the job when moving to its application form ([e9f1241](https://github.com/jessechumo/wera-extension/commit/e9f1241c50d1cc826360d25dff7e0c178b99937a))


### Bug Fixes

* e2e passes again, narrow panel guard, React 19 / Vite 8 ([06d8824](https://github.com/jessechumo/wera-extension/commit/06d88243bdb488d57456e140ce1dcd5c499c3976))
* **resume:** link to the resume in the profile's Resume tab ([0407073](https://github.com/jessechumo/wera-extension/commit/0407073d129dd647d4ee61a18cb13acb0871b816))
* **sidepanel:** never scroll sideways in a narrow panel ([bea2b89](https://github.com/jessechumo/wera-extension/commit/bea2b89e5ac648d3f642f37a7ae23a9f85629369))


### Refactoring

* **sidepanel:** reset state during render instead of in effects ([1378a3d](https://github.com/jessechumo/wera-extension/commit/1378a3d746c4b493508fc930154c9aff91bb3b7d))


### Documentation

* add the README and an architecture diagram ([5093468](https://github.com/jessechumo/wera-extension/commit/5093468ca97d1145aea06afa97867b2e7cf9ec27))
* describe embedded forms, page following and the dashboard bridge ([67c6243](https://github.com/jessechumo/wera-extension/commit/67c624351b181ad5911a574f2a70eed1f182cf60))
* describe tailored resumes and which resume Fill attaches ([87d2009](https://github.com/jessechumo/wera-extension/commit/87d2009ee18ed56ed30f871a334a24949e3b9476))
* plan Wera for Chrome ([0eaf89b](https://github.com/jessechumo/wera-extension/commit/0eaf89b4697a08c2d55161879d3c24fb977cd561))
