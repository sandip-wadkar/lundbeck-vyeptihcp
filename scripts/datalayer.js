/**
 * Adobe Client Data Layer (ACDL) helper for EDS.
 * Ported from AEM AMS datalayer.js (ANL-163). Event names and payload
 * shapes are kept identical so the existing AEP Tags rules/data elements
 * work unchanged. eventInfo uses a capital "I" to match the Tag property.
 */

/** Ensures the data layer array exists before any push. */
export function initializeDataLayer() { 
    window.adobeDataLayer = window.adobeDataLayer || [];
} 

// Centralised config — single source of truth for event names + payload strings.
export const DATA_LAYER_CONFIG = {
  linkEvents: { LINK_INTERACTION: 'linkInteraction' },
  linkMeta: { eventName: 'Global Link Interaction' },
  formEvents: {
    FORM_START: 'formStart',
    FORM_SUBMIT_ATTEMPT: 'formSubmitAttempt',
    FORM_SUBMIT: 'formSubmit',
  },
  formMeta: {
    signupForm: {
      formName: 'Request information about VYEPTI',
      formType: 'Registration Form',
      eventNameStart: 'Sign up form started',
      eventNameSubmitAttempt: 'Sign up form submit attempted',
      eventNameSubmit: 'Sign up form submitted',
    },
  },
  scrollEvents: { SCROLL_DEPTH: 'scrollDepth' },
  scrollMeta: {
    thresholds: [25, 50, 75, 100],
    throttleMs: 200,
    eventNameSuffix: '% scroll depth threshold reached',
  },
  errorEvents: { ERROR: 'error' },
  errorMeta: {
    pageNotFound: {
      pageNameMatch: 'Page Not Found',
      eventName: 'Error 404 appeared on the page',
      validationErrorCode: '404',
      errorMessage: 'Page Not Found',
    },
    globalError: { eventName: 'Global Error Type' },
  },
  videoEvents: { VIDEO_PLAY: 'videoPlay', VIDEO_PROGRESS: 'videoProgress' },
  videoMeta: {
    eventNamePlay: 'Video Started',
    eventNameProgress: 'Video Milestone achieved',
    milestones: [25, 50, 75, 100],
    // NOTE: EDS video block is YouTube/Vimeo, not Brightcove — override per player.
    playerName: 'Brightcove Player v5 - Default',
    playerVendor: 'Brightcove',
  },
  pageEvents: { PAGE_VIEW: 'pageView' },
  pageMeta: { eventName: 'Global Page Load' },
  modalEvents: { MODAL_CLICK: 'modalClick' },
  modalMeta: { eventName: 'Interacted with Modal Viewed' },
  infusionEvents: {
    SEARCH_SUCCESS: 'infusionSearchSuccess',
    SEARCH_FAILURE: 'infusionSearchFailure',
  },
  infusionMeta: {
    eventNameSuccess: 'Infusion search success with results',
    eventNameFailure: 'Infusion search failure with no results',
    customEventName: 'vyepti:infusion-search',
  },
  coverageFinderEvents: {
    COVERAGE_FINDER_START: 'coverageFinderStart',
    COVERAGE_PLAN_CHECK: 'coveragePlanCheck',
  },
  coverageFinderMeta: {
    eventName: 'Coverage Finder Search Triggered',
    planCheck: { eventName: 'Coverage Plan Check' },
  },
  chatEvents: {
    CHAT_ASSISTANT_CLICKED: 'chatAssistantClicked',
    CHAT_START: 'chatStart',
    CHAT_DEFERRED: 'chatDeferred',
    CHAT_MODE_SWITCH: 'chatModeSwitch',
    AI_CHAT_SESSION_START: 'aiChatSessionStart',
    TEXT_CHAT_SESSION_START: 'textChatSessionStart',
    CHAT_RESOURCE_LINK_CLICKED: 'chatResourceLinkClicked',
    CHAT_CLOSED: 'chatClosed',
  },
  chatMeta: {
    eventNameAssistantClicked: 'Chat widget icon was clicked',
    eventNameStart: '"Start Chatting" button was clicked',
    eventNameDeferred: '"Try later" button was clicked',
    eventNameModeSwitch: 'Chat mode switched',
    eventNameAiSessionStart: 'AI chat session has started',
    eventNameTextSessionStart: 'Text chat session has started',
    eventNameResourceLink: 'Resource link clicked from active chat session',
    eventNameClosed: 'Chat session was closed',
  },
};

/** Low-level push. Guarantees the data layer exists first. */
export function pushToAdobeDataLayer(eventTrackingData) {
  initializeDataLayer();
  window.adobeDataLayer.push(eventTrackingData);
}

/** Link interaction (internalLink / Exit / Download). fileName only for downloads. */
export function pushLinkInteractionEventToDataLayer(data) {
  const {
    linkName, linkUrl, linkType, moduleName, moduleType, fileName,
  } = data;
  pushToAdobeDataLayer({
    event: DATA_LAYER_CONFIG.linkEvents.LINK_INTERACTION,
    eventInfo: { eventName: DATA_LAYER_CONFIG.linkMeta.eventName },
    linkInfo: {
      linkName: linkName || null,
      linkUrl: linkUrl || null,
      linkType: linkType || null,
      ...(fileName && { fileName: fileName || null }),
    },
    module: { moduleName, moduleType },
  });
}

/** Video play / progress milestone. */
export function pushVideoEventToDataLayer(videoTrackingData) {
  const {
    eventType, videoId, videoName, duration, playerId,
    playerName, playerVendor, playerVersion, progressPercentage,
  } = videoTrackingData;

  const isPlay = eventType === DATA_LAYER_CONFIG.videoEvents.VIDEO_PLAY;
  const media = { id: videoId, name: videoName || null, duration };
  if (!isPlay) media.progressPercentage = progressPercentage;

  pushToAdobeDataLayer({
    event: eventType,
    eventInfo: {
      eventName: isPlay
        ? DATA_LAYER_CONFIG.videoMeta.eventNamePlay
        : DATA_LAYER_CONFIG.videoMeta.eventNameProgress,
    },
    media,
    player: {
      id: playerId || null,
      name: playerName || null,
      vendor: playerVendor || null,
      version: playerVersion || null,
    },
  });
}

/** Modal click / interaction. */
export function pushModalClickEventToDataLayer(data) {
  const {
    modalName, modalType, modalInteraction, modalValue,
  } = data;
  pushToAdobeDataLayer({
    event: DATA_LAYER_CONFIG.modalEvents.MODAL_CLICK,
    eventInfo: { eventName: DATA_LAYER_CONFIG.modalMeta.eventName },
    modalInfo: {
      modalName: modalName || null,
      modalType: modalType || null,
      modalInteraction: modalInteraction || null,
      ...(modalValue && { modalValue }),
    },
  });
}

/** Coverage Finder search started. */
export function pushCoverageFinderEventToDataLayer(data) {
  pushToAdobeDataLayer({
    event: DATA_LAYER_CONFIG.coverageFinderEvents.COVERAGE_FINDER_START,
    eventInfo: { eventName: DATA_LAYER_CONFIG.coverageFinderMeta.eventName },
    coverageFinderInfo: { zipCode: data.zipCode },
  });
}

/** Coverage plan check. */
export function pushCoveragePlanCheckEventToDataLayer(data) {
  pushToAdobeDataLayer({
    event: DATA_LAYER_CONFIG.coverageFinderEvents.COVERAGE_PLAN_CHECK,
    eventInfo: { eventName: DATA_LAYER_CONFIG.coverageFinderMeta.planCheck.eventName },
    coveragePlanInfo: {
      benefitType: data.benefitType || null,
      planName: data.planName || null,
      planType: data.planType || null,
    },
  });
}
