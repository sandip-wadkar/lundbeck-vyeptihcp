export function getPageMetadata() { 
    return { 
        title: getMetadata('title'), 
        pageType: getMetadata('page-type'), 
        language: document.documentElement.lang 
    }; 
}