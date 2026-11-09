import {afterEach,expect,it,vi} from 'vitest';
import {extensionApi} from '../lib/browser-api';
afterEach(()=>vi.unstubAllGlobals());
it('uses Firefox promise APIs when browser is present, otherwise uses Chromium MV3 APIs',()=>{
 const chromeApi={runtime:{id:'chromium'}},firefoxApi={runtime:{id:'firefox'}};
 vi.stubGlobal('chrome',chromeApi);expect(extensionApi()).toBe(chromeApi);
 vi.stubGlobal('browser',firefoxApi);expect(extensionApi()).toBe(firefoxApi);
});
