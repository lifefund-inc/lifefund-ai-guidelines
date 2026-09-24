# LIFEFUND_AIガイドライン

## 概要

LIFEFUNDにおけるAI活用ガイドラインと公開HTMLを管理するフォルダです。

## 現在の状態

- 人間向け編集正本: `AIガイドライン_原稿.md`
- 生成コピー: `index.html` / `【成果物】AIガイドライン.html`
- 現在の版: 第1.4版（2026-09-24 代表取締役社長が承認、2026-07-21に遡って施行。問い合わせ先は経営戦略本部 業務管理課）
- 公開・施行状況: 施行中。公開URL https://lifefund-inc.github.io/lifefund-ai-guidelines/ （GitHub `lifefund-inc/lifefund-ai-guidelines`、PUBLIC）。公開版はこのフォルダと同じ最新版1つだけを置く
- 情報分類・利用判定の機械可読正本: `../AI経営OS全社展開/01_全社共通設計/2026-07-21_AI利用判定モデル.json`
- 判定モデル構成: schema 1.1 / ordered decision rules 20件
- 判定モデルSHA-256: `46F8F9FC34FECEE335B869D3A7DEE3657B51A5E1E82A7A151C568BB7851C70F9`
- 旧Claude Code自動セットアップ手順: **2026-07-20廃止・実行禁止**

## 主な中身

- `AIガイドライン_原稿.md`: 人が内容を編集・決裁する正本
- `index.html` / `【成果物】AIガイドライン.html`: 原稿から生成する同一内容のHTMLコピー。`index.html` が公開ページ
- `AIツール利用申請フォーム作成.gs`: AIツール利用申請フォーム作成用GAS
- `旧版案内_stub_template.html`: 旧版配布HTMLを「旧版・参照禁止」の案内stubへ再生成するための開発用テンプレート。公開・社員配布の対象外
- `Claude_Code_ベストプラクティス設計書.html`: 技術設計者向けの参考資料
- `Claude_Code_環境セットアップ.md`: 過去URL保全用の廃止案内。セットアップには使用しない
- `_archive/`: 過去版の保管場所

## 更新ルール

- 社員が実行する現行手順は、社内共有ドライブ `00_全社共通_AI` の社員向け案内を使用する。
- 組織招待URL、認証情報、秘密鍵をHTML、Markdown、Git、Driveへ保存しない。
- 内容変更は `AIガイドライン_原稿.md` を先に行い、HTMLを手編集の正本にしない。
- 旧版配布stubは `旧版案内_stub_template.html` と同じ内容に保ち、旧ガイドライン本文を再掲しない。
- HTML生成時は `policyVersion` と判定モデルSHA-256を埋め込み、公開HTML・成果物HTML・社内配布コピーのbyte一致を確認する。
- 情報区分は `PUBLIC` / `INTERNAL` / `RESTRICTED` / `CREDENTIAL` の正式表記を使用し、閲覧・送信範囲を示す `access_scope` と混同しない。
- 例外承認・外部開示承認・匿名化レビューは、本人申告ではなく権威承認台帳の記録と実要求を照合して判定する。
- 次の版を作るときは、承認されるまで公開リポジトリへpushしない。施行日・承認者・問い合わせ先は推測で補完しない。
- このフォルダのGitは公開リポジトリ `lifefund-inc/lifefund-ai-guidelines` の `main` を追跡する（2026-09-24から）。トークン入りの旧履歴は `lifefund-inc/lifefund-ai-guidelines-history`（PRIVATE、remote名 `history`）に保管している。push・GitHub Pages反映は白都さんの承認後に行う。認証情報はコードへ書かず、GASはScript Propertiesから読む。
- GASを実行する場合は、フォームやシートへの影響を事前に確認する。
