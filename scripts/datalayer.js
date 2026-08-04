export function initializeDataLayer() { 
    window.adobeDataLayer = window.adobeDataLayer || [];
} 
export function pushEvent(eventName, data = {}) {
    //ensure the data layer is initialized before pushing events
    initializeDataLayer();
    window.adobeDataLayer.push({ 
        event: eventName, 
        eventinfo: data,
        timestamp: Date.now(),
        pageURL: window.location.href
    });
} 
export function publishPageLoaded(pageData) { 
    pushEvent('pageLoaded', pageData);
} 
export function publishCTA(ctaData) { 
    pushEvent('ctaClick', ctaData);
}