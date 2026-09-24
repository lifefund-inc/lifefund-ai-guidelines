/**
 * 株式会社LIFEFUND AIツール利用申請フォーム 保守スクリプト
 *
 * 【通常の保守手順】
 * 1. 会社アカウントが所有する既存のApps Scriptプロジェクトを開く
 * 2. Script Propertiesに CHATWORK_LIFEFUND_BOT_API_TOKEN、CHATWORK_LIFEFUND_BOT_ACCOUNT_ID、CHATWORK_ROOM_ID、SPREADSHEET_URL を設定する
 * 3. 既存運用物は AI_TOOL_APPLICATION_FORM_ID・AI_TOOL_APPLICATION_SPREADSHEET_ID と
 *    AI_TOOL_APPLICATION_CREATION_STATE=READY を設定してから保守する
 * 4. 通知はREADY・両ID有効・URLとSheet ID一致・イベントForm ID一致の場合のみ実行する
 * 5. フォーム送信トリガーの所有者・実行者が会社アカウントであることを確認する
 * 6. 旧個人アカウント所有の対象トリガーは会社側から見えないため、旧所有者側で削除し0件の証跡を保存する
 * 7. createAIToolApplicationForm() は対象フォームの通知トリガーを1件に正規化する
 * 8. 既存運用物では ALLOW_NEW_AI_TOOL_APPLICATION_FORM を設定しない
 *
 * 【新規作成が正式承認された場合のみ】
 * Script Propertiesに ALLOW_NEW_AI_TOOL_APPLICATION_FORM=true を設定してから
 * createAIToolApplicationForm() を実行する。許可は作成前に自動消費され、中断時は保存済みIDから再開する。
 * 通常運用でID・状態プロパティを手動更新せず、再実行時に作成許可を再設定しない。
 *
 * 【作成API直後の強制終了からの管理者復旧】
 * 1. ALLOW_NEW_AI_TOOL_APPLICATION_FORM=true は再設定しない
 * 2. 会社アカウントの管理者が作成済み資源を特定し、正しい既存IDのみ復旧する
 * 3. Formのみ作成済みなら AI_TOOL_APPLICATION_FORM_ID と
 *    AI_TOOL_APPLICATION_CREATION_STATE=FORM_CREATED を設定する
 * 4. Sheetまで作成済みなら両ID・SPREADSHEET_URL・
 *    AI_TOOL_APPLICATION_CREATION_STATE=SHEET_CREATED を設定する
 * 5. IDとURLの一致を管理者が確認後、作成許可を戻さずに再実行する
 * 6. 正しい資源を特定できない場合は停止し、新規作成を続行しない
 *
 * 【旧個人アカウント所有トリガーの移行】
 * 1. 旧所有者が対象Scriptの onFormSubmitNotify トリガーをすべて削除する
 * 2. 旧所有者のアカウント・対象Script・0件・確認日が分かる画面または監査記録を保存する
 * 3. 会社アカウントで createAIToolApplicationForm() を実行し、ON_FORM_SUBMITが1件であることを確認する
 * フォームURL・シートURL・認証値はログへ出力しない。
 */

const FORM_CREATION_MODE_PROPERTY = 'ALLOW_NEW_AI_TOOL_APPLICATION_FORM';
const CHATWORK_API_TOKEN_PROPERTY = 'CHATWORK_LIFEFUND_BOT_API_TOKEN';
const CHATWORK_ACCOUNT_ID_PROPERTY = 'CHATWORK_LIFEFUND_BOT_ACCOUNT_ID';
const CHATWORK_ROOM_ID_PROPERTY = 'CHATWORK_ROOM_ID';
const EXPECTED_CHATWORK_ACCOUNT_ID = '11379709';
const EXPECTED_CHATWORK_ROOM_ID = '429317092';
const SPREADSHEET_URL_PROPERTY = 'SPREADSHEET_URL';
const FORM_ID_PROPERTY = 'AI_TOOL_APPLICATION_FORM_ID';
const SPREADSHEET_ID_PROPERTY = 'AI_TOOL_APPLICATION_SPREADSHEET_ID';
const CREATION_STATE_PROPERTY = 'AI_TOOL_APPLICATION_CREATION_STATE';
const CREATION_STATE_PERMISSION_PENDING = 'PERMISSION_PENDING';
const CREATION_STATE_STARTED = 'STARTED';
const CREATION_STATE_FORM_CREATED = 'FORM_CREATED';
const CREATION_STATE_FORM_CONFIGURED = 'FORM_CONFIGURED';
const CREATION_STATE_SHEET_CREATED = 'SHEET_CREATED';
const CREATION_STATE_SHEET_CONFIGURED = 'SHEET_CONFIGURED';
const CREATION_STATE_READY = 'READY';
const FORM_SUBMIT_HANDLER = 'onFormSubmitNotify';
const CREATION_LOCK_WAIT_MILLISECONDS = 30000;
const CHATWORK_FIELD_MAX_CODE_POINTS = 200;
const CHATWORK_MESSAGE_MAX_CODE_POINTS = 4000;
const CHATWORK_EMPTY_FIELD_TEXT = '未入力';
const FORM_RESPONSE_VALIDATION_ERROR_MESSAGE = 'フォーム送信イベントの回答情報を確認できないため通知を停止しました。';

function getRequiredScriptProperty_(propertyName) {
  var value = PropertiesService.getScriptProperties().getProperty(propertyName);
  if (value === null || String(value).trim() === '') {
    throw new Error('Script Propertiesの必須設定が不足しています: ' + propertyName);
  }
  return String(value).trim();
}

function getChatworkConfig_() {
  var roomId = getRequiredScriptProperty_(CHATWORK_ROOM_ID_PROPERTY);
  if (!/^\d+$/.test(roomId)) {
    throw new Error('Script PropertiesのCHATWORK_ROOM_IDが正しい形式ではありません。');
  }
  if (roomId !== EXPECTED_CHATWORK_ROOM_ID) {
    throw new Error('Chatwork送信先がライファ君の許可済みAIツール申請ルームと一致しません。');
  }
  var accountId = getRequiredScriptProperty_(CHATWORK_ACCOUNT_ID_PROPERTY);
  if (accountId !== EXPECTED_CHATWORK_ACCOUNT_ID) {
    throw new Error('Chatwork送信アカウントがライファ君と一致しません。');
  }
  return {
    apiToken: getRequiredScriptProperty_(CHATWORK_API_TOKEN_PROPERTY),
    accountId: accountId,
    roomId: roomId
  };
}

function hasNonEmptyValue_(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function isValidGoogleResourceId_(resourceId) {
  return hasNonEmptyValue_(resourceId) && /^[A-Za-z0-9_-]+$/.test(String(resourceId).trim());
}

function extractGoogleSheetsIdFromUrl_(spreadsheetUrl) {
  var match = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/(?:edit|view|preview|copy))?(?:[?#][A-Za-z0-9_=&.%~-]*)*$/.exec(spreadsheetUrl);
  if (match === null) {
    throw new Error('Script PropertiesのSPREADSHEET_URLがGoogle Sheets URL形式ではありません。');
  }
  return match[1];
}

function getNotificationPreflight_() {
  var creationState = getRequiredScriptProperty_(CREATION_STATE_PROPERTY);
  if (creationState !== CREATION_STATE_READY) {
    throw new Error('AIツール申請フォームがREADY状態ではないため通知を停止しました。');
  }
  var formId = getRequiredScriptProperty_(FORM_ID_PROPERTY);
  if (!isValidGoogleResourceId_(formId)) {
    throw new Error('Script PropertiesのAI_TOOL_APPLICATION_FORM_IDが正しい形式ではありません。');
  }
  var chatworkConfig = getChatworkConfig_();
  var spreadsheetUrl = getRequiredScriptProperty_(SPREADSHEET_URL_PROPERTY);
  var spreadsheetId = getRequiredScriptProperty_(SPREADSHEET_ID_PROPERTY);
  if (!isValidGoogleResourceId_(spreadsheetId)) {
    throw new Error('Script PropertiesのAI_TOOL_APPLICATION_SPREADSHEET_IDが正しい形式ではありません。');
  }
  if (extractGoogleSheetsIdFromUrl_(spreadsheetUrl) !== spreadsheetId) {
    throw new Error('Script PropertiesのSPREADSHEET_URLとSPREADSHEET_IDが一致しません。');
  }
  return {
    creationState: creationState,
    formId: formId,
    chatworkConfig: chatworkConfig,
    spreadsheetUrl: spreadsheetUrl,
    spreadsheetId: spreadsheetId
  };
}

/**
 * AIツール申請通知の本番設定を、Chatworkへ送信せずに確認する。
 * Botアカウント、固定送信先、既存フォーム・回答シート、フォーム送信トリガー1件を必須とする。
 */
function verifyAiToolApplicationNotificationSetup() {
  var preflight = getNotificationPreflight_();
  verifyChatworkSender_(preflight.chatworkConfig);

  var form = openFormByIdSafely_(preflight.formId);
  var spreadsheet = openSpreadsheetByIdSafely_(preflight.spreadsheetId);
  if (form.getDestinationId() !== spreadsheet.getId()) {
    throw new Error('申請フォームの回答先が保存済みスプレッドシートと一致しません。');
  }

  var triggerCount = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === FORM_SUBMIT_HANDLER &&
      trigger.getTriggerSourceId() === preflight.formId &&
      trigger.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT;
  }).length;
  if (triggerCount !== 1) {
    throw new Error('フォーム送信トリガーが1件ではないため通知を停止しました。現在: ' + triggerCount + '件');
  }

  var result = {
    ok: true,
    chatworkAccountId: preflight.chatworkConfig.accountId,
    chatworkRoomId: preflight.chatworkConfig.roomId,
    formId: form.getId(),
    spreadsheetId: spreadsheet.getId(),
    triggerCount: triggerCount
  };
  Logger.log(JSON.stringify(result));
  return result;
}

function consumeNewFormCreationPermission_(scriptProperties) {
  var creationMode = scriptProperties.getProperty(FORM_CREATION_MODE_PROPERTY);
  if (creationMode === 'true') {
    scriptProperties.setProperty(FORM_CREATION_MODE_PROPERTY, 'consumed');
    return;
  }
  if (creationMode !== 'consumed') {
    throw new Error('保守モードのため、新規フォームと回答シートの生成を停止しました。正式承認後に一回限りの作成許可を設定してください。');
  }
}

function getCreationStateRank_(state) {
  var ranks = {};
  ranks[CREATION_STATE_PERMISSION_PENDING] = 1;
  ranks[CREATION_STATE_STARTED] = 2;
  ranks[CREATION_STATE_FORM_CREATED] = 3;
  ranks[CREATION_STATE_FORM_CONFIGURED] = 4;
  ranks[CREATION_STATE_SHEET_CREATED] = 5;
  ranks[CREATION_STATE_SHEET_CONFIGURED] = 6;
  ranks[CREATION_STATE_READY] = 7;
  return ranks[state] || 0;
}

function isCreationStateAtLeast_(state, expectedState) {
  return getCreationStateRank_(state) >= getCreationStateRank_(expectedState);
}

function validateStoredCreationState_(scriptProperties, state) {
  var hasState = hasNonEmptyValue_(state);
  var formId = scriptProperties.getProperty(FORM_ID_PROPERTY);
  var spreadsheetId = scriptProperties.getProperty(SPREADSHEET_ID_PROPERTY);
  var spreadsheetUrl = scriptProperties.getProperty(SPREADSHEET_URL_PROPERTY);
  var hasFormId = hasNonEmptyValue_(formId);
  var hasSpreadsheetId = hasNonEmptyValue_(spreadsheetId);
  var hasSpreadsheetUrl = hasNonEmptyValue_(spreadsheetUrl);

  if (!hasState) {
    if (hasFormId || hasSpreadsheetId || hasSpreadsheetUrl) {
      throw new Error('作成状態が未設定のまま保存済み資源情報が残っているため停止しました。');
    }
    return;
  }

  var stateRank = getCreationStateRank_(state);
  if (stateRank === 0) {
    throw new Error('作成状態が不正なため停止しました。Script Propertiesの状態設定を確認してください。');
  }
  if (hasFormId && !isValidGoogleResourceId_(formId)) {
    throw new Error('保存済みのフォームID形式が不正なため停止しました。');
  }
  if (hasSpreadsheetId && !isValidGoogleResourceId_(spreadsheetId)) {
    throw new Error('保存済みのスプレッドシートID形式が不正なため停止しました。');
  }
  if (hasSpreadsheetUrl) {
    var urlSpreadsheetId = extractGoogleSheetsIdFromUrl_(String(spreadsheetUrl).trim());
    if (!hasSpreadsheetId || urlSpreadsheetId !== String(spreadsheetId).trim()) {
      throw new Error('保存済みのスプレッドシートURLとIDが一致しないため停止しました。');
    }
  }
  if (stateRank >= getCreationStateRank_(CREATION_STATE_FORM_CREATED) && !hasFormId) {
    throw new Error('現在の作成状態に必要なフォームIDが未設定のため停止しました。');
  }
  if (stateRank >= getCreationStateRank_(CREATION_STATE_SHEET_CREATED) &&
      (!hasFormId || !hasSpreadsheetId)) {
    throw new Error('現在の作成状態に必要なフォームIDまたはスプレッドシートIDが未設定のため停止しました。');
  }
  if (state === CREATION_STATE_READY && !hasSpreadsheetUrl) {
    throw new Error('READY状態に必要なスプレッドシートURLが未設定のため停止しました。');
  }
}

function openFormByIdSafely_(formId) {
  try {
    return FormApp.openById(formId);
  } catch (error) {
    throw new Error('保存済みの申請フォームを開けません。所有アカウントとScript Propertiesを確認してください。');
  }
}

function openSpreadsheetByIdSafely_(spreadsheetId) {
  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (error) {
    throw new Error('保存済みの回答スプレッドシートを開けません。所有アカウントとScript Propertiesを確認してください。');
  }
}

function resetUnfinishedFormConfiguration_(form) {
  var existingItems = form.getItems();
  for (var i = existingItems.length - 1; i >= 0; i--) {
    form.deleteItem(existingItems[i]);
  }
}

function normalizeFormSubmitTrigger_(form) {
  var targetFormId = form.getId();
  var relatedTriggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === FORM_SUBMIT_HANDLER &&
      trigger.getTriggerSourceId() === targetFormId;
  });
  var correctTriggers = relatedTriggers.filter(function(trigger) {
    return trigger.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT;
  });
  var triggerToKeep;

  if (correctTriggers.length > 0) {
    triggerToKeep = correctTriggers[0];
  } else {
    triggerToKeep = ScriptApp.newTrigger(FORM_SUBMIT_HANDLER)
      .forForm(form)
      .onFormSubmit()
      .create();
  }

  for (var i = 0; i < relatedTriggers.length; i++) {
    if (relatedTriggers[i] !== triggerToKeep) {
      ScriptApp.deleteTrigger(relatedTriggers[i]);
    }
  }
}

function createAIToolApplicationForm() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(CREATION_LOCK_WAIT_MILLISECONDS)) {
    throw new Error('別の作成処理が実行中のため停止しました。完了後に再実行してください。');
  }

  try {
    return createOrResumeAIToolApplicationForm_();
  } finally {
    lock.releaseLock();
  }
}

function createOrResumeAIToolApplicationForm_() {
  var scriptProperties = PropertiesService.getScriptProperties();
  var state = scriptProperties.getProperty(CREATION_STATE_PROPERTY);
  validateStoredCreationState_(scriptProperties, state);
  var resumed = state !== null && state !== '';

  if (!resumed) {
    if (scriptProperties.getProperty(FORM_CREATION_MODE_PROPERTY) !== 'true') {
      throw new Error('保守モードのため、新規フォームと回答シートの生成を停止しました。正式承認後に一回限りの作成許可を設定してください。');
    }
    state = CREATION_STATE_PERMISSION_PENDING;
    scriptProperties.setProperty(CREATION_STATE_PROPERTY, state);
  }

  if (state === CREATION_STATE_PERMISSION_PENDING) {
    consumeNewFormCreationPermission_(scriptProperties);
    state = CREATION_STATE_STARTED;
    scriptProperties.setProperty(CREATION_STATE_PROPERTY, state);
  }

  if (getCreationStateRank_(state) === 0) {
    throw new Error('作成状態が不正なため停止しました。Script Propertiesの状態設定を確認してください。');
  }
  if (state !== CREATION_STATE_READY &&
      scriptProperties.getProperty(FORM_CREATION_MODE_PROPERTY) !== 'consumed') {
    throw new Error('作成許可と再開状態が一致しないため停止しました。');
  }

  var savedFormId = scriptProperties.getProperty(FORM_ID_PROPERTY);
  var formExistedAtStart = savedFormId !== null && savedFormId !== '';
  var form;

  if (formExistedAtStart) {
    form = openFormByIdSafely_(savedFormId);
  } else {
    form = FormApp.create('AIツール利用申請フォーム｜株式会社LIFEFUND');
    scriptProperties.setProperty(FORM_ID_PROPERTY, form.getId());
    state = CREATION_STATE_FORM_CREATED;
    scriptProperties.setProperty(CREATION_STATE_PROPERTY, state);
  }

  if (!isCreationStateAtLeast_(state, CREATION_STATE_FORM_CONFIGURED)) {
    if (formExistedAtStart) {
      resetUnfinishedFormConfiguration_(form);
    }

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

    state = CREATION_STATE_FORM_CONFIGURED;
    scriptProperties.setProperty(CREATION_STATE_PROPERTY, state);
  }

  var savedSpreadsheetId = scriptProperties.getProperty(SPREADSHEET_ID_PROPERTY);
  var spreadsheetExistedAtStart = savedSpreadsheetId !== null && savedSpreadsheetId !== '';
  var ss;

  if (spreadsheetExistedAtStart) {
    ss = openSpreadsheetByIdSafely_(savedSpreadsheetId);
  } else {
    ss = SpreadsheetApp.create('AIツール利用申請｜回答一覧');
    scriptProperties.setProperty(SPREADSHEET_ID_PROPERTY, ss.getId());
    scriptProperties.setProperty(SPREADSHEET_URL_PROPERTY, ss.getUrl());
    state = CREATION_STATE_SHEET_CREATED;
    scriptProperties.setProperty(CREATION_STATE_PROPERTY, state);
  }

  scriptProperties.setProperty(SPREADSHEET_URL_PROPERTY, ss.getUrl());
  if (form.getDestinationId() !== ss.getId()) {
    form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  }

  // ── 管理台帳シートの作成 ──
  var ledger = ss.getSheetByName('管理台帳');
  if (ledger === null && isCreationStateAtLeast_(state, CREATION_STATE_SHEET_CONFIGURED)) {
    throw new Error('管理台帳シートを確認できないため、作成処理を停止しました。');
  }

  if (!isCreationStateAtLeast_(state, CREATION_STATE_SHEET_CONFIGURED)) {
    if (ledger === null) {
      ledger = ss.insertSheet('管理台帳');
    }
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

    state = CREATION_STATE_SHEET_CONFIGURED;
    scriptProperties.setProperty(CREATION_STATE_PROPERTY, state);
  }

  normalizeFormSubmitTrigger_(form);
  state = CREATION_STATE_READY;
  scriptProperties.setProperty(CREATION_STATE_PROPERTY, state);

  return {
    ready: true,
    resumed: resumed
  };
}

function truncateByCodePoints_(text, maxCodePoints) {
  var codePoints = Array.from(text);
  if (codePoints.length <= maxCodePoints) {
    return text;
  }
  return codePoints.slice(0, maxCodePoints - 1).join('') + '…';
}

function sanitizeChatworkField_(value) {
  var text;
  if (Array.isArray(value)) {
    text = value.join('、');
  } else if (value === null || value === undefined) {
    text = '';
  } else {
    text = String(value);
  }

  text = text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(/\t+/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\[/g, '［')
    .replace(/\]/g, '］')
    .trim();

  if (text === '') {
    return CHATWORK_EMPTY_FIELD_TEXT;
  }
  return truncateByCodePoints_(text, CHATWORK_FIELD_MAX_CODE_POINTS);
}

function formatChatworkCost_(value) {
  var sanitizedCost = sanitizeChatworkField_(value);
  if (/^\d+(?:\.\d+)?$/.test(sanitizedCost)) {
    return Number(sanitizedCost).toLocaleString();
  }
  return sanitizedCost;
}

function ensureChatworkMessageWithinLimit_(message) {
  if (Array.from(message).length > CHATWORK_MESSAGE_MAX_CODE_POINTS) {
    throw new Error('Chatwork通知本文が安全上限を超えたため送信を停止しました。');
  }
  return message;
}

/**
 * フォーム送信時のChatwork通知
 * AI活用推進担当宛にChatworkメッセージを送信
 */
function onFormSubmitNotify(e) {
  var preflight = getNotificationPreflight_();
  var sourceFormId;
  try {
    if (e === null || e === undefined || e.source === null || e.source === undefined ||
        typeof e.source.getId !== 'function') {
      throw new Error('INVALID_EVENT_SOURCE');
    }
    sourceFormId = String(e.source.getId()).trim();
  } catch (error) {
    throw new Error('フォーム送信イベントの発生元を確認できないため通知を停止しました。');
  }
  if (!isValidGoogleResourceId_(sourceFormId) || sourceFormId !== preflight.formId) {
    throw new Error('フォーム送信イベントの発生元が保存済みフォームと一致しないため通知を停止しました。');
  }

  var formResponse;
  try {
    formResponse = e.response;
  } catch (error) {
    throw new Error(FORM_RESPONSE_VALIDATION_ERROR_MESSAGE);
  }
  if (formResponse === null || formResponse === undefined ||
      typeof formResponse.getItemResponses !== 'function') {
    throw new Error(FORM_RESPONSE_VALIDATION_ERROR_MESSAGE);
  }

  var responses;
  try {
    responses = formResponse.getItemResponses();
  } catch (error) {
    throw new Error(FORM_RESPONSE_VALIDATION_ERROR_MESSAGE);
  }
  if (!Array.isArray(responses)) {
    throw new Error(FORM_RESPONSE_VALIDATION_ERROR_MESSAGE);
  }

  var spreadsheetUrl = preflight.spreadsheetUrl;
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

  applicantName = sanitizeChatworkField_(applicantName);
  toolName = sanitizeChatworkField_(toolName);
  planName = sanitizeChatworkField_(planName);
  applicationType = sanitizeChatworkField_(applicationType);
  department = sanitizeChatworkField_(department);
  contractType = sanitizeChatworkField_(contractType);
  userCount = sanitizeChatworkField_(userCount);
  var costDisplay = formatChatworkCost_(cost);

  var message = '[info][title]AIツール利用申請｜' + applicationType + '[/title]' +
    'ライファ君です。申請が1件届きました。\n' +
    'ツール名：' + toolName + '（' + planName + '）\n' +
    '申請者：' + applicantName + '（' + department + '）\n' +
    '契約形態：' + contractType + '\n' +
    '費用：' + costDisplay + '円 × ' + userCount + 'アカウント\n\n' +
    '審査先はこちらです。\n' +
    spreadsheetUrl + '[/info]';

  sendChatworkMessageWithConfig_(message, preflight.chatworkConfig);
}

/**
 * Chatwork APIでメッセージを送信
 */
function sendChatworkMessage(message) {
  var preflight = getNotificationPreflight_();
  sendChatworkMessageWithConfig_(message, preflight.chatworkConfig);
}

function sendChatworkMessageWithConfig_(message, chatworkConfig) {
  message = ensureChatworkMessageWithinLimit_(String(message));
  verifyChatworkSender_(chatworkConfig);
  var url = 'https://api.chatwork.com/v2/rooms/' + chatworkConfig.roomId + '/messages';
  var options = {
    method: 'post',
    muteHttpExceptions: true,
    headers: {
      'X-ChatWorkToken': chatworkConfig.apiToken
    },
    payload: {
      body: message,
      self_unread: 1
    }
  };

  var response;
  try {
    response = UrlFetchApp.fetch(url, options);
  } catch (error) {
    throw new Error('Chatwork通知に失敗しました（通信エラー）。');
  }

  var responseCode;
  try {
    responseCode = response.getResponseCode();
  } catch (error) {
    throw new Error('Chatwork通知に失敗しました（HTTP status取得エラー）。');
  }

  if (responseCode < 200 || responseCode >= 300) {
    throw new Error('Chatwork通知に失敗しました（HTTP status: ' + responseCode + '）。');
  }
  var result;
  try {
    result = JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error('Chatwork送信応答を確認できないため、再送せず停止しました。');
  }
  if (!result.message_id) {
    throw new Error('Chatwork送信応答にmessage_idがないため、再送せず停止しました。');
  }
  verifyChatworkMessageReadback_(chatworkConfig, String(result.message_id), message);
}

function verifyChatworkSender_(chatworkConfig) {
  var response = UrlFetchApp.fetch('https://api.chatwork.com/v2/me', {
    method: 'get',
    muteHttpExceptions: true,
    headers: { 'X-ChatWorkToken': chatworkConfig.apiToken }
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('Chatwork送信者を確認できないため通知を停止しました。');
  }
  var me = JSON.parse(response.getContentText());
  if (String(me.account_id) !== chatworkConfig.accountId || String(me.account_id) !== EXPECTED_CHATWORK_ACCOUNT_ID) {
    throw new Error('Chatwork送信者がライファ君ではないため通知を停止しました。');
  }
}

function verifyChatworkMessageReadback_(chatworkConfig, messageId, expectedBody) {
  var response = UrlFetchApp.fetch(
    'https://api.chatwork.com/v2/rooms/' + chatworkConfig.roomId + '/messages?force=1',
    {
      method: 'get',
      muteHttpExceptions: true,
      headers: { 'X-ChatWorkToken': chatworkConfig.apiToken }
    }
  );
  if (response.getResponseCode() !== 200) {
    throw new Error('送信後のChatwork履歴を確認できないため、再送せず停止しました。');
  }
  var messages = JSON.parse(response.getContentText());
  var matched = messages.filter(function(item) {
    return String(item.message_id) === messageId;
  });
  if (matched.length !== 1 ||
      String(matched[0].account.account_id) !== EXPECTED_CHATWORK_ACCOUNT_ID ||
      String(matched[0].body) !== expectedBody) {
    throw new Error('送信後の本文または送信者が一致しないため、再送せず停止しました。');
  }
}
