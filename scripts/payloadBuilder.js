export function buildPagePayload(metadata) { 
    return { 
        page: { 
            pageName: metadata.title, 
            pageType: metadata.pageType, 
            language: metadata.language 
        } 
    }; 
}