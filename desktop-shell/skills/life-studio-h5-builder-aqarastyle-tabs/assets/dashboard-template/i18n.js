(function installLifeI18n(global, document) {
  'use strict';

  const dictionaries = {
    'zh-CN': {
      roleRelated:'为你推荐',roleRestChoose:'选择休息的卧室',lightAdjust: '调节',
      "favoriteSaving":"正在保存…","favoriteMetadataLoadFailed":"收藏读取失败，点击重试","favoriteMetadataInvalid":"收藏数据格式暂不支持，请刷新后重试","favoriteMetadataConflict":"收藏已在其他位置更改，已更新选择，请重新确认","favoriteMetadataScopeChanged":"当前空间已变化，请重新选择","favoriteMetadataUnconfirmed":"保存结果待确认，请刷新后再试","favoriteMetadataContractRequired":"收藏保存暂不可用",
      speakerPlaying:'播放中',speakerPaused:'已暂停',speakerStopped:'已停止',speakerBuffering:'缓冲中',speakerPlay:'继续播放',speakerPause:'暂停',speakerPrevious:'上一首',speakerNext:'下一首',speakerVolume:'音量',speakerPlaybackControl:'播放控制',speakerUpdating:'正在确认设备状态…',speakerCapabilityHint:'仅显示设备支持的控制',
      fdLoading:"正在读取设备…",fdIndexFailed:"设备读取未完成，请下拉刷新重试",fdStale: "待更新", fdRefreshFailed: "设备状态刷新失败，请下拉重试", fdTitle: "常用设备", fdSelect: "选择常用设备", fdEmpty: "暂无常用设备\n可添加你常用的设备", fdUnknownRoom: "空间暂不可用", fdUnavailable: "设备暂不可用", fdOpenPlugin: "打开设备插件", fdCurtainAction: "自动开合或停止", fdOfflineToast: "设备已离线，请检查连接", fdPluginUnavailable: "打开设备插件失败或当前宿主不支持", fdViewDetails: "查看详情", fdContactTrue: "开着", fdContactFalse: "关着", fdPresenceOn: "有人", fdPresenceOff: "无人", fdLocked: "已上锁", fdUnlocked: "已开锁",
      currentStudio: '当前 Studio', studioStatusLoading: '正在获取 Studio 状态…', studioLocal: '局域网访问 Studio 中', studioCloud: '远程访问 Studio 中', studioUnavailable: 'Studio 连接不可用', studioCertificateError: '局域网证书异常', studioStatusUnknown: 'Studio 连接状态未知',
      spaceLoadAll:'读取完整空间数据',
      spaceDevicesOn_light:'{count}盏灯开着',spaceDevicesOn_shade:'{count}幅窗帘开着',spaceDevicesOn_climate:'{count}台空调开着',
      spaceUnconfirmed: '{count}项状态暂未确认，请稍后刷新',
      spaceAlready_on:"设备均已开启", spaceAlready_off:"设备均已关闭", spaceAlready_open:"窗帘均已全开", spaceAlready_close:"窗帘均已全关", spaceAlready_stop:"窗帘均已停止", spaceNoChangeSkipped:"{satisfied}项已满足目标，{skipped}项离线或不支持，已跳过", spaceBatchResult:"已受理{sent}项，{satisfied}项无需操作，{failed}项失败，{skipped}项离线或不支持已跳过", chooseHomeSpace:"请选择空间", noHomeSpaces:"暂无可选房间", roomTemperature:"空间温度", roomHumidity:"空间湿度", spaceControl: "空间控制", spaceAll: "全部空间", spaceCategory_light: "照明", spaceCategory_shade: "遮阳", spaceCategory_climate: "冷暖", spaceKind_light: "灯", spaceKind_shade: "窗帘", spaceKind_climate: "空调", spaceRoomsOn: "{count}个房间{kind}开着", spaceDevicesOn: "{count}个{kind}开着", spaceOffline: "{count}个离线", spaceEmpty: "该空间暂无此类设备", spaceLoading: "正在汇总空间数据…", spaceMore: "加载更多设备", space_on: "全开", space_off: "全关", space_open: "全开", space_close: "全关", space_stop: "停止", spaceSending: "指令发送中", spaceAccepted: "已受理{count}项控制", spacePartial: "已受理{sent}项，{failed}项未下发或失败，实际状态以设备回读为准", spaceNotReady: "请等待完整空间数据就绪，或结束当前控制",
      favoriteDefaultChoose:"请选择6个适合你的常用场景", sourceTemperature:"{name}温度",sourceHumidity:"{name}湿度",environmentSourceUnavailable:"来源不可用 · ",favoriteTitle: "常用场景", favoriteSelect: "选择常用场景", favoriteEmpty: "暂无常用场景\n可点击“+”添加常用", favoriteBack: "返回", favoriteConfirm: "确定（{count}/{max}）", favoriteLoading: "正在读取场景…", favoriteStudioUnavailable: "当前 Studio 未确认，暂时无法读取常用场景", favoriteLoadFailed: "场景读取失败，点击重试", favoriteSaveFailed: "本地保存失败，请重试", favoriteLimit: "已达到最大数量（{max}）", favoriteSucceeded: "请求成功", favoriteUnavailable: "场景暂不可用", favoriteDisabled: "已停用", favoriteMore: "加载更多场景",
      aiAssistant: 'AI 助手', aiAsk: '问问 Aqara AI Agent', openAI: '打开 Aqara AI 助手', aiUnavailable: '当前 App 不支持 AI 助手，请更新 App 后重试', aiFailed: '打开 AI 助手失败，请重试', aiDisabled: 'AI Agent 已关闭，可在我的页面开启', aiQuestionUnavailable: '当前 App 不支持携带问题打开 AI 助手，请更新 App 后重试',
      mine: '我的', openMine: '打开我的', drawerUnavailable: '当前 App 不支持我的抽屉，请更新 App 后重试', drawerFailed: '打开我的失败，请重试', pull: '下拉刷新', release: '松开刷新', refreshing: '正在刷新', refresh: '刷新家庭数据',
      connecting: '正在连接当前 Studio…', connected: '已连接当前 Studio', partial: '已连接，部分数据暂不可用', cached: '正在显示缓存，后台更新中',
      overviewDetails: '家庭数据', spaceQuick_light:'{count}盏开着', spaceQuick_shade:'{count}个开启', spaceQuick_climate:'{count}台开启', summaryLabel: '家庭概览', loadingHome: '正在读取家庭状态', loadingDetail: '正在读取空间与设备状态', allGood: '家，一切如常', attention: '部分设备需要关注', partiallyLoaded: '设备正在按需加载', waiting: '等待添加智能设备',
      onlineDevices: '在线设备', spaces: '空间', scenes: '场景', neverSynced: '尚未完成同步', lastSync: '最近同步 {time}', cachedAt: '缓存于 {time}', deviceSummary: '{total} 个设备，{online} 个在线', deviceSummaryLoaded: '已加载 {loaded}/{total} 个设备，其中 {online} 个在线',
      indoorTemperature: '室内温度', indoorHumidity: '室内湿度', childHomeTemperature: '家里温度', childHomeHumidity: '家里湿度', occupiedSpaces: '有人空间', indoorTemperatureCovered: '室内温度 · {count}空间', indoorHumidityCovered: '室内湿度 · {count}空间', occupiedSpacesCovered: '有人空间 · 覆盖{count}空间', overviewDeferred: '环境数据将在首屏后异步汇总', overviewLoading: '正在汇总 {indexed}/{total} 台设备', overviewComplete: '已汇总全部 {total} 台设备', overviewPartial: '已汇总 {indexed}/{total} 台设备，{failed} 台能力暂不可用', overviewUnavailable: '环境概览暂不可用',
      quickActions: '快速操作', sceneTitle: '场景', sceneNote: '点按立即执行', smartDevices: '智能设备', deviceTitle: '设备', deviceNote: '显示全部 {count} 个设备', deviceNoteLoaded: '已加载 {loaded}/{total} 个设备',
      all: '全部', spaceFilter: '按空间筛选设备', emptySpaceDevices: '此空间暂无设备', spaceDevicesNotLoaded: '此空间暂无已加载设备，可继续加载更多', loadMore: '加载更多（{shown}/{total}）', loadingMore: '正在加载下一页…', loadMoreFailed: '下一页加载失败，请重试', allDevicesLoaded: '已加载全部设备', emptyScenes: '当前 Studio 没有可手动触发的场景', emptyDevices: '当前 Studio 没有可显示的设备',
      online: '在线', offline: '离线', on: '已开启', off: '已关闭', readOnly: '只读', cachedReadOnly: '缓存只读', execute: '执行', unknownValue: '未知状态',
      currentTemperature: '当前温度', targetTemperature: '目标温度', climateMode: '运行模式', fanMode: '风速',
      cameraLive: '实时画面', cameraPlay: '开始直播', cameraPause: '暂停', cameraResume: '继续', cameraConnecting: '正在连接', cameraConnected: '直播中', cameraPaused: '已暂停', cameraUnavailable: '当前宿主不支持直播', cameraFailed: '直播连接失败', cameraPhasePrepare: '准备信令', cameraPhaseSignaling: '等待设备应答', cameraPhaseAnswer: '应用应答', cameraPhaseMedia: '连接媒体', cameraIceUnavailable: 'ICE服务器不可用',
      deviceCapabilities: '设备详情（{count}）', capabilitySheetLabel: '设备详情', openDeviceDetails: '打开设备详情', closeDetails: '关闭设备详情', availableControls: '更多控制', deviceReadings: '设备状态',
      executing: '正在执行“{name}”…', sceneDone: '“{name}”已执行', sceneFailed: '操作失败，请重试', commandSent: '指令已发送', controlFailed: '设备控制失败', controlNotApplied: '设备未执行该状态，已恢复实际状态', stateConfirmed: '设备状态已确认', statePending: '指令已接收，设备状态仍在同步', stateUnconfirmed: '设备状态暂未确认',
      fatalTitle: '暂时无法连接 Studio', fatalDetail: '请检查当前 Studio 登录状态与网络连接', fatalFallback: '请确认页面由已登录 Studio 的 Aqara Life 打开。', retry: '重新连接',
      unassigned: '未分配空间', unnamedDevice: '未命名设备', unnamedSpace: '未命名空间', unnamedScene: '未命名场景', studioScene: 'Studio 场景',
      noControl: '暂无安全快捷控制', controlCount: '{count} 个设备支持快捷控制', warningMore: '{first}，另有 {count} 项数据暂不可用',
      category_light: '灯光', category_outlet: '插座开关', category_climate: '环境', category_curtain: '窗帘', category_lock: '门锁', category_camera: '摄像头', category_sensor: '传感器', category_safety: '安全', category_vacuum: '清洁', category_media: '影音', category_hub: '网关', category_device: '其他',
    },
    'zh-TW': {
      roleRelated:'為你推薦',roleRestChoose:'選擇休息的臥室',lightAdjust: '調節',
      "favoriteSaving":"正在儲存…","favoriteMetadataLoadFailed":"收藏讀取失敗，點擊重試","favoriteMetadataInvalid":"收藏資料格式暫不支援，請重新整理後重試","favoriteMetadataConflict":"收藏已在其他位置更改，已更新選擇，請重新確認","favoriteMetadataScopeChanged":"目前空間已變更，請重新選擇","favoriteMetadataUnconfirmed":"儲存結果待確認，請重新整理後再試","favoriteMetadataContractRequired":"收藏儲存暫不可用",
      speakerPlaying:'播放中',speakerPaused:'已暫停',speakerStopped:'已停止',speakerBuffering:'緩衝中',speakerPlay:'繼續播放',speakerPause:'暫停',speakerPrevious:'上一首',speakerNext:'下一首',speakerVolume:'音量',speakerPlaybackControl:'播放控制',speakerUpdating:'正在確認裝置狀態…',speakerCapabilityHint:'僅顯示裝置支援的控制',
      fdLoading:"正在讀取裝置…",fdIndexFailed:"裝置讀取未完成，請下拉重新整理",fdStale: "待更新", fdRefreshFailed: "裝置狀態更新失敗，請下拉重試", fdTitle: "常用裝置", fdSelect: "選擇常用裝置", fdEmpty: "尚無常用裝置\n可新增你常用的裝置", fdUnknownRoom: "空間暫時無法使用", fdUnavailable: "裝置暫時無法使用", fdOpenPlugin: "開啟裝置外掛", fdCurtainAction: "自動開合或停止", fdOfflineToast: "裝置已離線，請檢查連線", fdPluginUnavailable: "開啟裝置外掛失敗或目前宿主不支援", fdViewDetails: "查看詳情", fdContactTrue: "開啟", fdContactFalse: "關閉", fdPresenceOn: "有人", fdPresenceOff: "無人", fdLocked: "已上鎖", fdUnlocked: "已解鎖",
      currentStudio: '目前 Studio', studioStatusLoading: '正在取得 Studio 狀態…', studioLocal: '區域網路存取 Studio 中', studioCloud: '遠端存取 Studio 中', studioUnavailable: 'Studio 連線無法使用', studioCertificateError: '區域網路憑證異常', studioStatusUnknown: 'Studio 連線狀態未知',
      spaceLoadAll:'讀取完整空間資料',
      spaceDevicesOn_light:'{count}盞燈開著',spaceDevicesOn_shade:'{count}幅窗簾開著',spaceDevicesOn_climate:'{count}台冷氣開著',
      spaceUnconfirmed: '{count}項狀態暫未確認，請稍後重新整理',
      spaceAlready_on:"裝置均已開啟", spaceAlready_off:"裝置均已關閉", spaceAlready_open:"窗簾均已全開", spaceAlready_close:"窗簾均已全關", spaceAlready_stop:"窗簾均已停止", spaceNoChangeSkipped:"{satisfied}項已滿足目標，{skipped}項離線或不支援，已略過", spaceBatchResult:"已受理{sent}項，{satisfied}項無需操作，{failed}項失敗，{skipped}項離線或不支援已略過", chooseHomeSpace:"請選擇空間", noHomeSpaces:"暫無可選房間", roomTemperature:"空間溫度", roomHumidity:"空間濕度", spaceControl: "空間控制", spaceAll: "全部空間", spaceCategory_light: "照明", spaceCategory_shade: "遮陽", spaceCategory_climate: "冷暖", spaceKind_light: "燈", spaceKind_shade: "窗簾", spaceKind_climate: "冷氣", spaceRoomsOn: "{count}個房間{kind}開著", spaceDevicesOn: "{count}個{kind}開著", spaceOffline: "{count}個離線", spaceEmpty: "此空間暫無此類裝置", spaceLoading: "正在彙總空間資料…", spaceMore: "載入更多裝置", space_on: "全開", space_off: "全關", space_open: "全開", space_close: "全關", space_stop: "停止", spaceSending: "指令傳送中", spaceAccepted: "已受理{count}項控制", spacePartial: "已受理{sent}項，{failed}項未傳送或失敗，實際狀態以裝置回讀為準", spaceNotReady: "請等待完整空間資料就緒，或結束目前控制",
      favoriteDefaultChoose:"請選擇6個適合你的常用場景", sourceTemperature:"{name}溫度",sourceHumidity:"{name}濕度",environmentSourceUnavailable:"來源不可用 · ",favoriteTitle: "常用場景", favoriteSelect: "選擇常用場景", favoriteEmpty: "暫無常用場景\n可點擊“+”加入常用", favoriteBack: "返回", favoriteConfirm: "確定（{count}/{max}）", favoriteLoading: "正在讀取場景…", favoriteStudioUnavailable: "目前 Studio 未確認，暫時無法讀取常用場景", favoriteLoadFailed: "場景讀取失敗，點擊重試", favoriteSaveFailed: "本機儲存失敗，請重試", favoriteLimit: "已達最大數量（{max}）", favoriteSucceeded: "請求成功", favoriteUnavailable: "場景暫不可用", favoriteDisabled: "已停用", favoriteMore: "載入更多場景",
      aiAssistant: 'AI 助手', aiAsk: '問問 Aqara AI Agent', openAI: '開啟 Aqara AI 助手', aiUnavailable: '目前 App 不支援 AI 助手，請更新 App 後重試', aiFailed: '開啟 AI 助手失敗，請重試', aiDisabled: 'AI Agent 已關閉，可在我的頁面開啟', aiQuestionUnavailable: '目前 App 不支援攜帶問題開啟 AI 助手，請更新 App 後重試',
      mine: '我的', openMine: '開啟我的', drawerUnavailable: '目前 App 不支援我的抽屜，請更新 App 後重試', drawerFailed: '開啟我的失敗，請重試', pull: '下拉重新整理', release: '放開重新整理', refreshing: '正在重新整理', refresh: '重新整理家庭資料',
      connecting: '正在連接目前 Studio…', connected: '已連接目前 Studio', partial: '已連接，部分資料暫時無法使用', cached: '正在顯示快取，背景更新中',
      overviewDetails: '家庭資料', spaceQuick_light:'{count}盞開著', spaceQuick_shade:'{count}個開啟', spaceQuick_climate:'{count}台開啟', summaryLabel: '家庭概覽', loadingHome: '正在讀取家庭狀態', loadingDetail: '正在讀取空間與裝置狀態', allGood: '家，一切如常', attention: '部分裝置需要注意', partiallyLoaded: '裝置正在按需載入', waiting: '等待新增智慧裝置',
      onlineDevices: '在線裝置', spaces: '空間', scenes: '場景', neverSynced: '尚未完成同步', lastSync: '最近同步 {time}', cachedAt: '快取於 {time}', deviceSummary: '{total} 個裝置，{online} 個在線', deviceSummaryLoaded: '已載入 {loaded}/{total} 個裝置，其中 {online} 個在線',
      indoorTemperature: '室內溫度', indoorHumidity: '室內濕度', childHomeTemperature: '家裡溫度', childHomeHumidity: '家裡濕度', occupiedSpaces: '有人空間', indoorTemperatureCovered: '室內溫度 · {count}空間', indoorHumidityCovered: '室內濕度 · {count}空間', occupiedSpacesCovered: '有人空間 · 覆蓋{count}空間', overviewDeferred: '環境資料將在首屏後非同步彙總', overviewLoading: '正在彙總 {indexed}/{total} 台裝置', overviewComplete: '已彙總全部 {total} 台裝置', overviewPartial: '已彙總 {indexed}/{total} 台裝置，{failed} 台能力暫時無法使用', overviewUnavailable: '環境概覽暫時無法使用',
      quickActions: '快速操作', sceneTitle: '場景', sceneNote: '點按立即執行', smartDevices: '智慧裝置', deviceTitle: '裝置', deviceNote: '顯示全部 {count} 個裝置', deviceNoteLoaded: '已載入 {loaded}/{total} 個裝置',
      all: '全部', spaceFilter: '依空間篩選裝置', emptySpaceDevices: '此空間暫無裝置', spaceDevicesNotLoaded: '此空間暫無已載入裝置，可繼續載入更多', loadMore: '載入更多（{shown}/{total}）', loadingMore: '正在載入下一頁…', loadMoreFailed: '下一頁載入失敗，請重試', allDevicesLoaded: '已載入全部裝置', emptyScenes: '目前 Studio 沒有可手動觸發的場景', emptyDevices: '目前 Studio 沒有可顯示的裝置',
      online: '在線', offline: '離線', on: '已開啟', off: '已關閉', readOnly: '唯讀', cachedReadOnly: '快取唯讀', execute: '執行', unknownValue: '未知狀態',
      currentTemperature: '目前溫度', targetTemperature: '目標溫度', climateMode: '運行模式', fanMode: '風速',
      cameraLive: '即時畫面', cameraPlay: '開始直播', cameraPause: '暫停', cameraResume: '繼續', cameraConnecting: '正在連接', cameraConnected: '直播中', cameraPaused: '已暫停', cameraUnavailable: '目前宿主不支援直播', cameraFailed: '直播連接失敗', cameraPhasePrepare: '準備訊號', cameraPhaseSignaling: '等待裝置應答', cameraPhaseAnswer: '套用應答', cameraPhaseMedia: '連接媒體', cameraIceUnavailable: 'ICE伺服器無法使用',
      deviceCapabilities: '裝置詳情（{count}）', capabilitySheetLabel: '裝置詳情', openDeviceDetails: '開啟裝置詳情', closeDetails: '關閉裝置詳情', availableControls: '更多控制', deviceReadings: '裝置狀態',
      executing: '正在執行「{name}」…', sceneDone: '「{name}」已執行', sceneFailed: '操作失敗，請重試', commandSent: '指令已傳送', controlFailed: '裝置控制失敗', controlNotApplied: '裝置未執行該狀態，已恢復實際狀態', stateConfirmed: '裝置狀態已確認', statePending: '指令已接收，裝置狀態仍在同步', stateUnconfirmed: '裝置狀態暫未確認',
      fatalTitle: '暫時無法連接 Studio', fatalDetail: '請檢查目前 Studio 登入狀態與網路連線', fatalFallback: '請確認頁面由已登入 Studio 的 Aqara Life 開啟。', retry: '重新連接',
      unassigned: '未分配空間', unnamedDevice: '未命名裝置', unnamedSpace: '未命名空間', unnamedScene: '未命名場景', studioScene: 'Studio 場景',
      noControl: '暫無安全快速控制', controlCount: '{count} 個裝置支援快速控制', warningMore: '{first}，另有 {count} 項資料暫時無法使用',
      category_light: '燈光', category_outlet: '插座開關', category_climate: '環境', category_curtain: '窗簾', category_lock: '門鎖', category_camera: '攝影機', category_sensor: '感測器', category_safety: '安全', category_vacuum: '清潔', category_media: '影音', category_hub: '閘道器', category_device: '其他',
    },
    en: {
      roleRelated:'For you',roleRestChoose:'Choose a bedroom',lightAdjust: 'Adjust',
      "favoriteSaving":"Saving…","favoriteMetadataLoadFailed":"Could not load favorites. Tap to retry.","favoriteMetadataInvalid":"Unsupported favorites data. Refresh and try again.","favoriteMetadataConflict":"Favorites changed elsewhere. Review the updated selection and confirm again.","favoriteMetadataScopeChanged":"The current Studio changed. Select again.","favoriteMetadataUnconfirmed":"Save result is unconfirmed. Refresh before trying again.","favoriteMetadataContractRequired":"Saving favorites is unavailable",
      speakerPlaying:'Playing',speakerPaused:'Paused',speakerStopped:'Stopped',speakerBuffering:'Buffering',speakerPlay:'Resume',speakerPause:'Pause',speakerPrevious:'Previous track',speakerNext:'Next track',speakerVolume:'Volume',speakerPlaybackControl:'Playback controls',speakerUpdating:'Confirming device state…',speakerCapabilityHint:'Only supported controls are shown',
      fdLoading:"Loading devices…",fdIndexFailed:"Device loading incomplete. Pull to retry.",fdStale: "Needs update", fdRefreshFailed: "Unable to refresh device state. Pull to retry.", fdTitle: "Favorite devices", fdSelect: "Select favorite devices", fdEmpty: "No favorite devices\nAdd the devices you use often", fdUnknownRoom: "Space unavailable", fdUnavailable: "Device unavailable", fdOpenPlugin: "Open device plugin", fdCurtainAction: "Auto open, close or stop", fdOfflineToast: "Device offline. Check its connection.", fdPluginUnavailable: "Device plugin failed to open or is unsupported", fdViewDetails: "View details", fdContactTrue: "Open", fdContactFalse: "Closed", fdPresenceOn: "Occupied", fdPresenceOff: "Unoccupied", fdLocked: "Locked", fdUnlocked: "Unlocked",
      currentStudio: 'Current Studio', studioStatusLoading: 'Reading Studio status…', studioLocal: 'Accessing Studio locally', studioCloud: 'Accessing Studio remotely', studioUnavailable: 'Studio connection unavailable', studioCertificateError: 'Local certificate error', studioStatusUnknown: 'Studio connection status unknown',
      spaceLoadAll:'Load complete space data',
      spaceDevicesOn_light:'{count} lights on',spaceDevicesOn_shade:'{count} curtains open',spaceDevicesOn_climate:'{count} air conditioners on',
      spaceUnconfirmed: '{count} states remain unconfirmed. Refresh later.',
      spaceAlready_on:"Devices are already on", spaceAlready_off:"Devices are already off", spaceAlready_open:"Curtains are fully open", spaceAlready_close:"Curtains are fully closed", spaceAlready_stop:"Curtains are stopped", spaceNoChangeSkipped:"{satisfied} already at target; {skipped} offline or unsupported, skipped", spaceBatchResult:"{sent} accepted; {satisfied} already at target; {failed} failed; {skipped} offline or unsupported, skipped", chooseHomeSpace:"Choose a space", noHomeSpaces:"No rooms available", roomTemperature:"Room temperature", roomHumidity:"Room humidity", spaceControl: "Space control", spaceAll: "All spaces", spaceCategory_light: "Lighting", spaceCategory_shade: "Shading", spaceCategory_climate: "Climate", spaceKind_light: "lights", spaceKind_shade: "curtains", spaceKind_climate: "air conditioners", spaceRoomsOn: "{kind} on in {count} rooms", spaceDevicesOn: "{count} {kind} on", spaceOffline: "{count} offline", spaceEmpty: "No devices of this type in this space", spaceLoading: "Loading space data…", spaceMore: "Load more devices", space_on: "All on", space_off: "All off", space_open: "All open", space_close: "All close", space_stop: "Stop", spaceSending: "Sending command", spaceAccepted: "{count} controls accepted", spacePartial: "{sent} accepted; {failed} skipped or failed. Actual states come from device readback.", spaceNotReady: "Wait for complete space data or the current control to finish",
      favoriteDefaultChoose:"Choose 6 favorite scenes for your dashboard", sourceTemperature:"{name} temperature",sourceHumidity:"{name} humidity",environmentSourceUnavailable:"Source unavailable · ",favoriteTitle: "Favorite scenes", favoriteSelect: "Select favorite scenes", favoriteEmpty: "No favorite scenes\nTap + to add favorites", favoriteBack: "Back", favoriteConfirm: "Done ({count}/{max})", favoriteLoading: "Loading scenes…", favoriteStudioUnavailable: "Current Studio is unavailable. Favorite scenes cannot be loaded.", favoriteLoadFailed: "Could not load scenes. Tap to retry", favoriteSaveFailed: "Could not save locally. Try again", favoriteLimit: "Maximum of {max} scenes reached", favoriteSucceeded: "Request accepted", favoriteUnavailable: "Scene unavailable", favoriteDisabled: "Disabled", favoriteMore: "Load more scenes",
      aiAssistant: 'AI assistant', aiAsk: 'Ask Aqara AI Agent', openAI: 'Open Aqara AI assistant', aiUnavailable: 'This App does not support the AI assistant. Please update the App.', aiFailed: 'Could not open the AI assistant. Please try again.', aiDisabled: 'AI Agent is off. Turn it on in Me.', aiQuestionUnavailable: 'Update the App to open the AI assistant with a question.',
      mine: 'Me', openMine: 'Open Me', drawerUnavailable: 'Update the app to open Me', drawerFailed: 'Unable to open Me. Try again.', pull: 'Pull to refresh', release: 'Release to refresh', refreshing: 'Refreshing', refresh: 'Refresh home data',
      connecting: 'Connecting to the current Studio…', connected: 'Connected to the current Studio', partial: 'Connected; some data is unavailable', cached: 'Showing cached data while updating',
      overviewDetails: 'Home details', spaceQuick_light:'{count} on', spaceQuick_shade:'{count} open', spaceQuick_climate:'{count} on', summaryLabel: 'Home overview', loadingHome: 'Loading home status', loadingDetail: 'Loading spaces and devices', allGood: 'Everything looks good', attention: 'Some devices need attention', partiallyLoaded: 'Devices load on demand', waiting: 'Waiting for smart devices',
      onlineDevices: 'Online devices', spaces: 'Spaces', scenes: 'Scenes', neverSynced: 'Not synced yet', lastSync: 'Last synced {time}', cachedAt: 'Cached at {time}', deviceSummary: '{total} devices, {online} online', deviceSummaryLoaded: '{loaded}/{total} devices loaded; {online} online',
      indoorTemperature: 'Indoor temperature', indoorHumidity: 'Indoor humidity', childHomeTemperature: 'Home temperature', childHomeHumidity: 'Home humidity', occupiedSpaces: 'Occupied spaces', indoorTemperatureCovered: 'Indoor temperature · {count} spaces', indoorHumidityCovered: 'Indoor humidity · {count} spaces', occupiedSpacesCovered: 'Occupied · {count} spaces monitored', overviewDeferred: 'Environment data is summarized after first paint', overviewLoading: 'Summarizing {indexed}/{total} devices', overviewComplete: 'All {total} devices summarized', overviewPartial: '{indexed}/{total} devices summarized; {failed} unavailable', overviewUnavailable: 'Environment overview unavailable',
      quickActions: 'Quick actions', sceneTitle: 'Scenes', sceneNote: 'Tap to run', smartDevices: 'Smart devices', deviceTitle: 'Devices', deviceNote: 'Showing all {count} devices', deviceNoteLoaded: '{loaded}/{total} devices loaded',
      all: 'All', spaceFilter: 'Filter devices by space', emptySpaceDevices: 'No devices in this space', spaceDevicesNotLoaded: 'No loaded devices in this space. Load more to continue.', loadMore: 'Load more ({shown}/{total})', loadingMore: 'Loading the next page…', loadMoreFailed: 'Unable to load the next page. Try again.', allDevicesLoaded: 'All devices loaded', emptyScenes: 'No manually triggered scenes in this Studio', emptyDevices: 'No devices to display in this Studio',
      online: 'Online', offline: 'Offline', on: 'On', off: 'Off', readOnly: 'Read only', cachedReadOnly: 'Cached · read only', execute: 'Run', unknownValue: 'Unknown state',
      currentTemperature: 'Current', targetTemperature: 'Target', climateMode: 'Mode', fanMode: 'Fan',
      cameraLive: 'Live view', cameraPlay: 'Start live view', cameraPause: 'Pause', cameraResume: 'Resume', cameraConnecting: 'Connecting', cameraConnected: 'Live', cameraPaused: 'Paused', cameraUnavailable: 'Live view is unavailable in this host', cameraFailed: 'Live view failed', cameraPhasePrepare: 'Preparing signaling', cameraPhaseSignaling: 'Waiting for camera', cameraPhaseAnswer: 'Applying answer', cameraPhaseMedia: 'Connecting media', cameraIceUnavailable: 'ICE servers unavailable',
      deviceCapabilities: 'Device details ({count})', capabilitySheetLabel: 'Device details', openDeviceDetails: 'Open device details', closeDetails: 'Close device details', availableControls: 'More controls', deviceReadings: 'Device status',
      executing: 'Running “{name}”…', sceneDone: '“{name}” ran successfully', sceneFailed: 'Operation failed. Please try again.', commandSent: 'Command sent', controlFailed: 'Device control failed', controlNotApplied: 'The device did not apply that state; the actual state is shown', stateConfirmed: 'Device state confirmed', statePending: 'Command accepted; device state is still syncing', stateUnconfirmed: 'Device state is not confirmed yet',
      fatalTitle: 'Unable to connect to Studio', fatalDetail: 'Check the current Studio session and network', fatalFallback: 'Open this page from Aqara Life while signed in to Studio.', retry: 'Reconnect',
      unassigned: 'Unassigned', unnamedDevice: 'Unnamed device', unnamedSpace: 'Unnamed space', unnamedScene: 'Unnamed scene', studioScene: 'Studio scene',
      noControl: 'No safe quick controls', controlCount: '{count} devices support quick control', warningMore: '{first}, plus {count} unavailable data sources',
      category_light: 'Lights', category_outlet: 'Switches', category_climate: 'Climate', category_curtain: 'Shades', category_lock: 'Locks', category_camera: 'Cameras', category_sensor: 'Sensors', category_safety: 'Safety', category_vacuum: 'Cleaning', category_media: 'Media', category_hub: 'Hubs', category_device: 'Other',
    },
  };

  const listeners = new Set();
  const bridge = global.LifeBridge;
  const launch = bridge && typeof bridge.launchContext === 'function' ? bridge.launchContext() : null;
  const navigator = global.navigator;
  let locale = normalize((launch && launch.language) || (navigator && navigator.language) || 'zh-CN');

  function normalize(value) {
    const text = String(value || '').replace(/_/g, '-').toLowerCase();
    if (text === 'zh-tw' || text === 'zh-hk' || text === 'zh-hant') return 'zh-TW';
    if (text.startsWith('zh')) return 'zh-CN';
    return 'en';
  }

  function t(key, values) {
    const localized = dictionaries[locale][key];
    const fallback = dictionaries.en[key];
    const template = localized !== null && localized !== undefined ? localized : (fallback !== null && fallback !== undefined ? fallback : key);
    return String(template).replace(/\{(\w+)\}/g, (_, name) => {
      const value = values && values[name];
      return String(value === null || value === undefined ? '' : value);
    });
  }

  // Semantic function copy only. Do not translate state values, API enum options or device names.
  // Columns: zh-CN, zh-TW, en. Role overrides are independent of visual skin/theme.
  const functionCopy = {
    "light.adjust": {"default":{"short":["调节","調節","Adjust"],"full":["调节灯光","調節燈光","Adjust lighting"]},"roles":{"female":{"short":["调光","調光","Adjust"],"full":["调节灯光","調節燈光","Adjust lighting"]},"senior":{"short":["调灯光","調燈光","Adjust"],"full":["调节灯光","調節燈光","Adjust lighting"]},"child":{"short":["调灯光","調燈光","Adjust"],"full":["调节灯光","調節燈光","Adjust lighting"]}}},
    "light.on": {"default":{"short":["开灯","開燈","Turn on"],"full":["打开灯光","打開燈光","Turn on the light"]},"roles":{}},
    "light.off": {"default":{"short":["关灯","關燈","Turn off"],"full":["关闭灯光","關閉燈光","Turn off the light"]},"roles":{}},
    "device.on": {"default":{"short":["打开","打開","Turn on"],"full":["打开","打開","Turn on"]},"roles":{}},
    "device.off": {"default":{"short":["关闭","關閉","Turn off"],"full":["关闭","關閉","Turn off"]},"roles":{}},
    "light.brightness": {"default":{"short":["亮度","亮度","Brightness"],"full":["亮度","亮度","Brightness"]},"roles":{"senior":{"short":["灯光亮度","燈光亮度","Light brightness"],"full":["灯光亮度","燈光亮度","Light brightness"]},"child":{"short":["灯光亮度","燈光亮度","Light brightness"],"full":["灯光亮度","燈光亮度","Light brightness"]}}},
    "light.temperature": {"default":{"short":["色温","色溫","Color temperature"],"full":["色温","色溫","Color temperature"]},"roles":{"female":{"short":["灯光色温","燈光色溫","Light color"],"full":["灯光色温","燈光色溫","Light color"]},"senior":{"short":["灯光冷暖","燈光冷暖","Light color"],"full":["灯光冷暖","燈光冷暖","Light color"]},"child":{"short":["灯光冷暖","燈光冷暖","Light color"],"full":["灯光冷暖","燈光冷暖","Light color"]}}},
    "curtain.open": {"default":{"short":["打开窗帘","打開窗簾","Open curtain"],"full":["打开窗帘","打開窗簾","Open curtain"]},"roles":{}},
    "curtain.close": {"default":{"short":["关上窗帘","關上窗簾","Close curtain"],"full":["关上窗帘","關上窗簾","Close curtain"]},"roles":{}},
    "curtain.stop": {"default":{"short":["停止","停止","Stop"],"full":["停止窗常运动","停止窗簾移動","Stop the curtain"]},"roles":{"senior":{"short":["停一下","停一下","Stop"],"full":["停止窗常运动","停止窗簾移動","Stop the curtain"]},"child":{"short":["停一下","停一下","Stop"],"full":["停止窗常运动","停止窗簾移動","Stop the curtain"]}}},
    "curtain.auto": {"default":{"short":["自动开合","自動開合","Auto control"],"full":["自动开合或停止窗帘","自動開合或停止窗簾","Automatically open, close or stop the curtain"]},"roles":{}},
    "climate.on": {"default":{"short":["打开冷暖设备","打開冷暖設備","Turn on climate control"],"full":["打开冷暖设备","打開冷暖設備","Turn on climate control"]},"roles":{}},
    "climate.off": {"default":{"short":["关闭冷暖设备","關閉冷暖設備","Turn off climate control"],"full":["关闭冷暖设备","關閉冷暖設備","Turn off climate control"]},"roles":{}},
    "climate.target": {"default":{"short":["设定温度","設定溫度","Target temperature"],"full":["设定温度","設定溫度","Target temperature"]},"roles":{"senior":{"short":["设置温度","設定溫度","Set temperature"],"full":["设置温度","設定溫度","Set temperature"]},"child":{"short":["设置温度","設定溫度","Set temperature"],"full":["设置温度","設定溫度","Set temperature"]}}},
    "climate.mode": {"default":{"short":["运行模式","運行模式","Operating mode"],"full":["运行模式","運行模式","Operating mode"]},"roles":{}},
    "climate.fan": {"default":{"short":["风速","風速","Fan speed"],"full":["风速","風速","Fan speed"]},"roles":{}},
    "speaker.play": {"default":{"short":["播放","播放","Play"],"full":["播放","播放","Play"]},"roles":{"senior":{"short":["继续播放","繼續播放","Resume playback"],"full":["继续播放","繼續播放","Resume playback"]},"child":{"short":["继续播放","繼續播放","Resume playback"],"full":["继续播放","繼續播放","Resume playback"]}}},
    "speaker.pause": {"default":{"short":["暂停","暫停","Pause"],"full":["暂停","暫停","Pause"]},"roles":{}},
    "speaker.previous": {"default":{"short":["上一首","上一首","Previous track"],"full":["上一首","上一首","Previous track"]},"roles":{}},
    "speaker.next": {"default":{"short":["下一首","下一首","Next track"],"full":["下一首","下一首","Next track"]},"roles":{}},
    "speaker.volume": {"default":{"short":["音量","音量","Volume"],"full":["调节音量","調節音量","Adjust volume"]},"roles":{}}
  };
  Object.keys(functionCopy).forEach(key => { const entry=functionCopy[key];Object.keys(entry.roles).forEach(role=>{Object.freeze(entry.roles[role].short);Object.freeze(entry.roles[role].full);Object.freeze(entry.roles[role]);});Object.freeze(entry.default.short);Object.freeze(entry.default.full);Object.freeze(entry.default);Object.freeze(entry.roles);Object.freeze(entry); });Object.freeze(functionCopy);
  // Role presentation is stable; question text requires a real, proven Studio room.
  const defaultAIIcon='m10 3 2.2 5.8L18 11l-5.8 2.2L10 19l-2.2-5.8L2 11l5.8-2.2L10 3Zm9-2 1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3Z';
  const aiRoleCopy=Object.freeze({
    male:{title:['问问 Aqara AI · 家庭状态','問問 Aqara AI · 家庭狀態','Ask Aqara AI · Home status'],open:['打开 Aqara AI 家庭助手','開啟 Aqara AI 家庭助手','Open Aqara AI home assistant'],icon:'M12 2 15 9l7 3-7 3-3 7-3-7-7-3 7-3 3-7ZM19 2l.8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8L19 2Z'},
    female:{title:['问问 Aqara AI · 家里环境','問問 Aqara AI · 家裡環境','Ask Aqara AI · Home comfort'],open:['打开 Aqara AI 家居助手','開啟 Aqara AI 家居助手','Open Aqara AI home assistant'],icon:'M12 2c1.4 4.7 2.3 6.1 7 7-4.7 1.4-5.6 2.3-7 7-1.4-4.7-2.3-5.6-7-7 4.7-.9 5.6-2.3 7-7ZM20 17l.7 1.3L22 19l-1.3.7L20 21l-.7-1.3L18 19l1.3-.7L20 17Z'},
    senior:{title:['有事问问 Aqara AI','有事問問 Aqara AI','Ask Aqara AI for help'],open:['打开 Aqara AI 助手','開啟 Aqara AI 助手','Open Aqara AI assistant'],icon:'M12 2 15 9l7 3-7 3-3 7-3-7-7-3 7-3 3-7Z'},
    child:{title:['问问 Aqara AI 小助手','問問 Aqara AI 小助手','Ask the Aqara AI helper'],open:['打开 Aqara AI 小助手','開啟 Aqara AI 小助手','Open the Aqara AI helper'],icon:'M11 2 13 7l5 2-5 2-2 5-2-5-5-2 5-2 2-5ZM19 12l1.3 3.7L24 17l-3.7 1.3L19 22l-1.3-3.7L14 17l3.7-1.3L19 12ZM4 17l.6 1.4L6 19l-1.4.6L4 21l-.6-1.4L2 19l1.4-.6L4 17Z'}
  });
  const aiQuestionTemplates={
    default:{presence:['看看{room}有没有人？','看看{room}有沒有人？','Is anyone in {room}?'],dimming:['把{room}的灯光调暗一点','把{room}的燈光調暗一點','Dim the lights in {room}'],environment:['看看{room}的温湿度','看看{room}的溫濕度','Check the temperature and humidity in {room}'],offline:['看看{room}有哪些设备离线？','看看{room}有哪些裝置離線？','Which devices are offline in {room}?']},
    male:{presence:['检查{room}有没有人？','檢查{room}有沒有人？','Check occupancy in {room}'],dimming:['把{room}灯光调暗一点','把{room}燈光調暗一點','Dim the lights in {room}'],environment:['查看{room}的温湿度','查看{room}的溫濕度','Check temperature and humidity in {room}'],offline:['检查{room}的离线设备','檢查{room}的離線裝置','Check offline devices in {room}']},
    female:{presence:['看看{room}有人吗？','看看{room}有人嗎？','Is anyone in {room}?'],dimming:['让{room}的灯光柔和一点','讓{room}的燈光柔和一點','Soften the lights in {room}'],environment:['看看{room}现在的温湿度','看看{room}現在的溫濕度','How is the temperature and humidity in {room}?'],offline:['看看{room}有没有设备掉线？','看看{room}有沒有裝置掉線？','Are any devices offline in {room}?']},
    senior:{presence:['看看{room}有人吗？','看看{room}有人嗎？','Is anyone in {room}?'],dimming:['帮我把{room}的灯调暗一点','幫我把{room}的燈調暗一點','Please dim the lights in {room}'],environment:['{room}现在多少度、湿度多少？','{room}現在多少度、濕度多少？','What are the temperature and humidity in {room}?'],offline:['{room}有设备没连上吗？','{room}有裝置沒連上嗎？','Are any devices disconnected in {room}?']},
    child:{presence:['看看{room}有人吗？','看看{room}有人嗎？','Is anyone in {room}?'],dimming:['把{room}的灯调暗一点','把{room}的燈調暗一點','Dim the lights in {room}'],environment:['{room}现在几度呀？湿度是多少？','{room}現在幾度呀？濕度是多少？','What are the temperature and humidity in {room}?'],offline:['{room}的设备都连上了吗？','{room}的裝置都連上了嗎？','Are the devices connected in {room}?']}
  };
  function aiPresentation(role) {
    const copy=aiRoleCopy[role],index=['zh-CN','zh-TW','en'].indexOf(locale);
    return Object.freeze({title:copy?copy.title[index]:t('aiAsk'),openLabel:copy?copy.open[index]:t('openAI'),iconPath:copy?copy.icon:defaultAIIcon,question:(key,room)=>{const template=(aiQuestionTemplates[role]||aiQuestionTemplates.default)[key];return template && room?template[index].replace('{room}',room):'';}});
  }
  function functionText(key, options) {
    const opts=options || {},entry=functionCopy[key];if(!entry)return opts.fallback || '';
    const role=opts.role || (global.__LIFE_STUDIO_DASHBOARD_CONFIG__ || {}).role || '',copy=entry.roles[role] || entry.default;
    const index=['zh-CN','zh-TW','en'].indexOf(locale),form=opts.form==='full'?'full':'short';return copy[form][index] || entry.default[form][index];
  }
  function controlText(control, category, form) {
    if(!control)return '';const code=String(control.traitCode || '').replace(/[^a-z0-9]/gi,'').toLowerCase();let key='';
    if(category==='light' && control.kind==='range'){if(['brightness','brightnesslevel','targetbrightness','currentlevel'].includes(code))key='light.brightness';if(['colortemperature','colortemperaturemireds','targetcolortemperature'].includes(code))key='light.temperature';}
    return functionText(key,{form:form,fallback:control.label || control.traitCode || control.commandCode || control.commandName || ''});
  }
  function overviewTitle() { const role=(global.__LIFE_STUDIO_DASHBOARD_CONFIG__ || {}).role;const titles={male:['家庭控制','家庭控制','Home controls'],female:['家里环境','家裡環境','Home atmosphere'],senior:['家里环境','家裡環境','Home environment'],child:['家里现在','家裡現在','Home right now']};return titles[role]?titles[role][['zh-CN','zh-TW','en'].indexOf(locale)]:t('summaryLabel'); }

  function setLocale(value) {
    const next = normalize(value);
    if (next === locale) return;
    locale = next;
    document.documentElement.lang = next === 'en' ? 'en' : next;
    listeners.forEach((listener) => listener(next));
  }

  function onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  document.documentElement.lang = locale === 'en' ? 'en' : locale;
  global.LifeI18n = Object.freeze({ t, functionText, controlText, overviewTitle, aiPresentation, functionCopy, setLocale, onChange, getLocale: () => locale, normalize });
})(window, document);
