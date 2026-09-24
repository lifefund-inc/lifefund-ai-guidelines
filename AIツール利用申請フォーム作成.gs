/**
 * 株式会社LIFEFUND AIツール利用申請フォーム 自動生成スクリプト
 *
 * 【使い方】
 * 1. Google Apps Script Editor（https://script.google.com）で新規プロジェクトを作成
 * 2. このコードを貼り付けて保存
 * 3. createAIToolApplicationForm() を実行
 * 4. コンソールに表示されるフォームURLをコピー
 * 5. AIガイドラインHTMLの #GOOGLE_FORM_URL を取得したURLに置換
 */

function createAIToolApplicationForm() {
  // フォーム作成
  var form = FormApp.create('AIツール利用申請フォーム｜株式会社LIFEFUND');
  form.setDescription(
    '株式会社LIFEFUND AIガイドラインに基づくAIツール利用申請フォームです。\n' +
    '新規ツールの利用申請、有償アカウントの申請を受け付けます。\n\n' +
    '※ 申請後、所属長およびAI活用推進担当による審査を行います。\n' +
    '※ 新規ツールの場合、セキュリティ確認のため承認まで1〜2週間程度かかる場合があります。'
  );
  form.setConfirmationMessage(
    '申請を受け付けました。\n' +
    '所属長およびAI活用推進担当（経営戦略室 石野）による審査後、結果をご連絡します。'
  );
  form.setAllowResponseEdits(false);
  form.setCollectEmail(true);

  // ── 1. 申請種類 ──
  form.addMultipleChoiceItem()
    .setTitle('申請種類')
    .setHelpText('該当する申請種類を選択してください')
    .setChoiceValues([
      '新規ツール利用',
      '有償アカウント'
    ])
    .setRequired(true);

  // ── 2. 申請者氏名 ──
  form.addTextItem()
    .setTitle('申請者氏名')
    .setHelpText('フルネームで入力してください')
    .setRequired(true);

  // ── 3. 所属部門 ──
  form.addListItem()
    .setTitle('所属部門')
    .setChoiceValues([
      '経営戦略本部（新規事業プロジェクト含）',
      '業務管理課',
      'マーケティング課',
      '組織人事課',
      '不動産事業部',
      'AI事業部',
      'ARRCHアドバイザー課',
      'PGHOUSEアドバイザー課',
      '建設技術統括部',
      '設計課',
      '建設課'
    ])
    .setRequired(true);

  // ── 4. ツール名 ──
  form.addTextItem()
    .setTitle('ツール名')
    .setHelpText('正式名称で正確に入力してください（例：ChatGPT、Claude、Cursor など）。表記ゆれがあると審査が遅れる場合があります')
    .setRequired(true);

  // ── 6. プラン名 ──
  form.addTextItem()
    .setTitle('プラン名')
    .setHelpText('利用したいプラン名を入力してください（例：Pro、Team、Enterprise など）')
    .setRequired(true);

  // ── 7. 提供元 ──
  form.addTextItem()
    .setTitle('提供元（サービス提供会社）')
    .setHelpText('ツールを提供している会社名を入力してください（例：OpenAI、Anthropic など）')
    .setRequired(true);

  // ── 8. ツールの公式URL ──
  form.addTextItem()
    .setTitle('ツールの公式URL')
    .setHelpText('ツールの公式サイトURLを入力してください')
    .setRequired(true);

  // ── 9. 利用目的 ──
  form.addParagraphTextItem()
    .setTitle('利用目的')
    .setHelpText('どのような業務にどのように使用するか、具体的に記載してください')
    .setRequired(true);

  // ── 10. 期待効果 ──
  form.addParagraphTextItem()
    .setTitle('期待効果')
    .setHelpText('業務効率化・品質向上等の期待される効果を記載してください（定量的な記載を推奨）')
    .setRequired(true);

  // ── 11. 契約形態 ──
  form.addMultipleChoiceItem()
    .setTitle('契約形態')
    .setChoiceValues([
      '月額契約',
      '年間契約'
    ])
    .setRequired(true);

  // ── 12. 1アカウントあたりの費用（税込・円） ──
  var costItem = form.addTextItem();
  costItem.setTitle('1アカウントあたりの費用（税込・円）');
  costItem.setHelpText('数字のみ入力してください（例：3000）。カンマ・円記号は不要です。月額契約の場合は月額、年間契約の場合は年額を入力');
  costItem.setRequired(true);
  costItem.setValidation(FormApp.createTextValidation()
    .setHelpText('半角数字のみ入力してください')
    .requireNumber()
    .build());

  // ── 13. 利用人数（アカウント数） ──
  var userCountItem = form.addTextItem();
  userCountItem.setTitle('利用人数（アカウント数）');
  userCountItem.setHelpText('必要なアカウント数を数字で入力してください（例：1）');
  userCountItem.setRequired(true);
  userCountItem.setValidation(FormApp.createTextValidation()
    .setHelpText('半角数字のみ入力してください')
    .requireWholeNumber()
    .build());

  // ── 14. 利用開始希望日 ──
  form.addDateItem()
    .setTitle('利用開始希望日')
    .setRequired(true);

  // ── 15. 既存承認済みツールで代替できない理由 ──
  form.addParagraphTextItem()
    .setTitle('既存承認済みツールで代替できない理由')
    .setHelpText('既に承認済みのツール（特にGoogle系AI：Gemini、NotebookLM、Google AI Studio）で代替できない理由を記載してください')
    .setRequired(true);

  // ── 15. セキュリティ確認 ──
  var securityCheck = form.addCheckboxItem();
  securityCheck.setTitle('セキュリティ確認');
  securityCheck.setHelpText('以下の全ての項目を確認し、チェックしてください');
  securityCheck.setChoices([
    securityCheck.createChoice('利用規約・プライバシーポリシーを確認しました'),
    securityCheck.createChoice('個人情報・機密情報の取り扱いに関するリスクを理解しています'),
    securityCheck.createChoice('本ガイドラインの内容を遵守します')
  ]);
  securityCheck.setRequired(true);

  // ── 回答先スプレッドシートの自動連携 ──
  var ss = SpreadsheetApp.create('AIツール利用申請｜回答一覧');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // ── 管理台帳シートの作成 ──
  var ledger = ss.insertSheet('管理台帳');
  var headers = [
    '審査ステータス', '審査コメント',
    '申請種類', '申請者氏名', '所属部門',
    'ツール名', 'プラン名', '提供元', 'ツールの公式URL',
    '契約形態', '1アカウントあたりの費用（円）', 'アカウント数', '月額換算コスト',
    '利用開始日', 'ステータス', '契約更新日', '備考'
  ];
  var headerRange = ledger.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1a1a2e');
  headerRange.setFontColor('#ffffff');
  headerRange.setHorizontalAlignment('center');

  // 審査ステータス列にプルダウン設定（2行目〜100行目）
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['承認', '棄却', '保留'], true)
    .build();
  ledger.getRange(2, 1, 99, 1).setDataValidation(statusRule);

  // ステータス列にプルダウン設定
  var activeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['利用中', '解約済み'], true)
    .build();
  ledger.getRange(2, 15, 99, 1).setDataValidation(activeRule);

  // 列幅調整
  ledger.setColumnWidth(1, 110);  // 審査ステータス
  ledger.setColumnWidth(2, 200);  // 審査コメント
  ledger.setColumnWidth(6, 130);  // ツール名
  ledger.setColumnWidth(13, 120); // 月額換算コスト
  ledger.setColumnWidth(17, 200); // 備考
  ledger.setFrozenRows(1);

  // ── スプレッドシートURLをスクリプトプロパティに保存 ──
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_URL', ss.getUrl());

  // ── フォーム送信時のChatwork通知トリガー設定 ──
  ScriptApp.newTrigger('onFormSubmitNotify')
    .forForm(form)
    .onFormSubmit()
    .create();

  // ── 結果をコンソールに出力 ──
  Logger.log('=== フォーム作成完了 ===');
  Logger.log('フォームURL（編集用）: ' + form.getEditUrl());
  Logger.log('フォームURL（回答用）: ' + form.getPublishedUrl());
  Logger.log('スプレッドシートURL: ' + ss.getUrl());
  Logger.log('');
  Logger.log('【次のステップ】');
  Logger.log('1. 上記の「フォームURL（回答用）」をコピーしてください');
  Logger.log('2. AIガイドラインHTMLファイル内の #GOOGLE_FORM_URL をこのURLに置換してください');

  return {
    formEditUrl: form.getEditUrl(),
    formPublishedUrl: form.getPublishedUrl(),
    spreadsheetUrl: ss.getUrl()
  };
}

/**
 * フォーム送信時のChatwork通知
 * AI活用推進担当宛にChatworkメッセージを送信
 */
var CHATWORK_API_TOKEN = PropertiesService.getScriptProperties().getProperty('CHATWORK_API_TOKEN'); // トークンはScript Propertiesに設定する
var CHATWORK_ROOM_ID = '424753766';

function onFormSubmitNotify(e) {
  var responses = e.response.getItemResponses();
  var applicantName = '';
  var toolName = '';
  var planName = '';
  var applicationType = '';
  var department = '';
  var cost = '';
  var contractType = '';
  var userCount = '';

  for (var i = 0; i < responses.length; i++) {
    var title = responses[i].getItem().getTitle();
    var answer = responses[i].getResponse();
    if (title === '申請者氏名') applicantName = answer;
    if (title === 'ツール名') toolName = answer;
    if (title === '申請種類') applicationType = answer;
    if (title === '所属部門') department = answer;
    if (title === 'プラン名') planName = answer;
    if (title === '契約形態') contractType = answer;
    if (title === '1アカウントあたりの費用（税込・円）') cost = answer;
    if (title === '利用人数（アカウント数）') userCount = answer;
  }

  var message = '[info][title]【AIツール利用申請】' + applicationType + '[/title]' +
    'ツール名：' + toolName + '（' + planName + '）\n' +
    '申請者：' + applicantName + '（' + department + '）\n' +
    '契約形態：' + contractType + '\n' +
    '費用：' + Number(cost).toLocaleString() + '円 × ' + userCount + 'アカウント\n\n' +
    '▼ 回答スプレッドシート\n' +
    PropertiesService.getScriptProperties().getProperty('SPREADSHEET_URL') + '[/info]';

  sendChatworkMessage(message);
}

/**
 * Chatwork APIでメッセージを送信
 */
function sendChatworkMessage(message) {
  var url = 'https://api.chatwork.com/v2/rooms/' + CHATWORK_ROOM_ID + '/messages';
  var options = {
    method: 'post',
    headers: {
      'X-ChatWorkToken': CHATWORK_API_TOKEN
    },
    payload: {
      body: message,
      self_unread: 1
    }
  };
  UrlFetchApp.fetch(url, options);
}
