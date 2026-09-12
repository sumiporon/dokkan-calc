/* Local message relay candidate. It makes no external request and has no timer. */
browser.runtime.onMessage.addListener(message => message?.kind === 'f3-prep-local' ? Promise.resolve({ accepted:true }) : Promise.resolve({ accepted:false }));
