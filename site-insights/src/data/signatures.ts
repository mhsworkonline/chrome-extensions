/**
 * Tech fingerprints. Every field is optional; a technology matches when any one signal hits.
 *  n: name, c: category
 *  s: regexes tested against script/link/iframe/image URLs and inline script text
 *  g: window global paths (dot-separated)
 *  m: meta tag name -> regex (first capture group becomes the version)
 *  d: CSS selectors present in the DOM
 */
export interface Signature {
  n: string;
  c: string;
  s?: string[];
  g?: string[];
  m?: Record<string, string>;
  d?: string[];
}

export const SIGNATURES: Signature[] = [
  // JavaScript frameworks
  { n: 'Next.js', c: 'JavaScript framework', g: ['__NEXT_DATA__', 'next.version'], d: ['#__next'], s: ['/_next/static/'] },
  { n: 'Nuxt', c: 'JavaScript framework', g: ['__NUXT__', '$nuxt'], d: ['#__nuxt'], s: ['/_nuxt/'] },
  { n: 'Gatsby', c: 'JavaScript framework', d: ['#___gatsby'], m: { generator: '^Gatsby ?([\\d.]+)?' } },
  { n: 'Remix', c: 'JavaScript framework', g: ['__remixContext'] },
  { n: 'Astro', c: 'JavaScript framework', d: ['astro-island', 'astro-slot'], m: { generator: '^Astro v?([\\d.]+)?' } },
  { n: 'Angular', c: 'JavaScript framework', g: ['ng.coreTokens'], d: ['[ng-version]', 'app-root'] },
  { n: 'Svelte', c: 'JavaScript framework', d: ['[class*="svelte-"]'] },
  { n: 'SvelteKit', c: 'JavaScript framework', d: ['[data-sveltekit-preload-data]'], s: ['/_app/immutable/'] },
  { n: 'Ember.js', c: 'JavaScript framework', g: ['Ember', 'Ember.VERSION'] },
  { n: 'Backbone.js', c: 'JavaScript framework', g: ['Backbone'] },
  { n: 'Alpine.js', c: 'JavaScript framework', g: ['Alpine'], d: ['[x-data]'] },
  { n: 'htmx', c: 'JavaScript framework', g: ['htmx'], d: ['[hx-get]', '[hx-post]'] },
  { n: 'Turbo', c: 'JavaScript framework', g: ['Turbo'], d: ['turbo-frame'] },
  { n: 'Stimulus', c: 'JavaScript framework', d: ['[data-controller]'] },
  { n: 'Solid', c: 'JavaScript framework', g: ['_$HY'] },
  { n: 'Qwik', c: 'JavaScript framework', d: ['[q\\:container]'] },
  { n: 'Livewire', c: 'JavaScript framework', g: ['Livewire'] },

  // JavaScript libraries
  { n: 'jQuery', c: 'JavaScript library', g: ['jQuery.fn.jquery', 'jQuery'], s: ['jquery[.-]'] },
  { n: 'jQuery UI', c: 'JavaScript library', g: ['jQuery.ui'] },
  { n: 'Lodash', c: 'JavaScript library', s: ['lodash(\\.min)?\\.js'] },
  { n: 'Underscore.js', c: 'JavaScript library', s: ['underscore(-min)?\\.js'] },
  { n: 'Moment.js', c: 'JavaScript library', g: ['moment'], s: ['moment(\\.min)?\\.js'] },
  { n: 'D3', c: 'JavaScript library', g: ['d3.version'], s: ['d3(\\.v\\d+)?(\\.min)?\\.js'] },
  { n: 'Chart.js', c: 'JavaScript library', g: ['Chart.version'], s: ['chart(\\.umd)?(\\.min)?\\.js'] },
  { n: 'Three.js', c: 'JavaScript library', g: ['THREE.REVISION'] },
  { n: 'GSAP', c: 'JavaScript library', g: ['gsap', 'TweenMax'] },
  { n: 'Swiper', c: 'JavaScript library', g: ['Swiper'], s: ['swiper(-bundle)?(\\.min)?\\.js'] },
  { n: 'Axios', c: 'JavaScript library', g: ['axios'], s: ['axios(\\.min)?\\.js'] },
  { n: 'Socket.IO', c: 'JavaScript library', s: ['socket\\.io'] },
  { n: 'Leaflet', c: 'JavaScript library', g: ['L.version'], s: ['leaflet'] },
  { n: 'Modernizr', c: 'JavaScript library', g: ['Modernizr'] },
  { n: 'Lottie', c: 'JavaScript library', g: ['lottie', 'bodymovin'], s: ['lottie'] },
  { n: 'core-js', c: 'JavaScript library', g: ['__core-js_shared__'] },

  // UI frameworks
  { n: 'Bootstrap', c: 'UI framework', g: ['bootstrap'], s: ['bootstrap(\\.bundle)?(\\.min)?\\.(js|css)'] },
  { n: 'Tailwind CSS', c: 'UI framework', s: ['cdn\\.tailwindcss\\.com', 'tailwind(\\.min)?\\.css'] },
  { n: 'Font Awesome', c: 'Fonts', s: ['font-?awesome', 'fontawesome'] },
  { n: 'Google Fonts', c: 'Fonts', s: ['fonts\\.googleapis\\.com', 'fonts\\.gstatic\\.com'] },
  { n: 'Adobe Fonts', c: 'Fonts', s: ['use\\.typekit\\.net', 'fonts\\.adobe\\.com'] },
  { n: 'Foundation', c: 'UI framework', g: ['Foundation'] },
  { n: 'Materialize', c: 'UI framework', g: ['M.Materialbox'], s: ['materialize(\\.min)?\\.(js|css)'] },

  // CMS & site builders
  { n: 'WordPress', c: 'CMS', m: { generator: '^WordPress ?([\\d.]+)?' }, s: ['/wp-content/', '/wp-includes/', '/wp-json/'] },
  { n: 'Drupal', c: 'CMS', g: ['Drupal'], m: { generator: '^Drupal ?([\\d.]+)?' } },
  { n: 'Joomla', c: 'CMS', m: { generator: '^Joomla! ?([\\d.]+)?' }, g: ['Joomla'] },
  { n: 'Ghost', c: 'CMS', m: { generator: '^Ghost ?([\\d.]+)?' } },
  { n: 'TYPO3', c: 'CMS', m: { generator: '^TYPO3' } },
  { n: 'Wix', c: 'Site builder', s: ['static\\.parastorage\\.com', 'wixstatic\\.com'], m: { generator: '^Wix\\.com' } },
  { n: 'Squarespace', c: 'Site builder', s: ['static1\\.squarespace\\.com', 'squarespace-cdn\\.com'], g: ['Static.SQUARESPACE_CONTEXT'], m: { generator: '^Squarespace' } },
  { n: 'Webflow', c: 'Site builder', d: ['html[data-wf-site]'], m: { generator: '^Webflow' } },
  { n: 'Framer', c: 'Site builder', s: ['framerusercontent\\.com'], m: { generator: '^Framer' } },
  { n: 'Weebly', c: 'Site builder', s: ['weebly\\.com', 'editmysite\\.com'] },
  { n: 'GoDaddy Website Builder', c: 'Site builder', s: ['img1\\.wsimg\\.com'] },
  { n: 'Blogger', c: 'CMS', m: { generator: '^Blogger' } },
  { n: 'HubSpot CMS', c: 'CMS', m: { generator: '^HubSpot' } },
  { n: 'Elementor', c: 'CMS', d: ['[data-elementor-type]'], s: ['/elementor/'] },
  { n: 'Divi', c: 'CMS', d: ['#et-main-area', '.et_pb_section'] },
  { n: 'MediaWiki', c: 'CMS', m: { generator: '^MediaWiki ?([\\d.]+)?' }, g: ['mw.config'] },
  { n: 'Discourse', c: 'CMS', m: { generator: '^Discourse ?([\\d.]+)?' }, g: ['Discourse'] },
  { n: 'Hugo', c: 'Static site generator', m: { generator: '^Hugo ?([\\d.]+)?' } },
  { n: 'Jekyll', c: 'Static site generator', m: { generator: '^Jekyll ?(v?[\\d.]+)?' } },
  { n: 'Docusaurus', c: 'Static site generator', m: { generator: '^Docusaurus ?(v?[\\d.]+)?' } },
  { n: 'VitePress', c: 'Static site generator', m: { generator: '^VitePress ?(v?[\\d.]+)?' } },
  { n: 'Eleventy', c: 'Static site generator', m: { generator: '^Eleventy' } },

  // E-commerce
  { n: 'Shopify', c: 'E-commerce', g: ['Shopify'], s: ['cdn\\.shopify\\.com'] },
  { n: 'WooCommerce', c: 'E-commerce', d: ['.woocommerce'], s: ['/woocommerce/'], m: { generator: '^WooCommerce ?([\\d.]+)?' } },
  { n: 'Magento', c: 'E-commerce', s: ['/static/version\\d+/frontend/', 'mage/'], g: ['Mage'] },
  { n: 'BigCommerce', c: 'E-commerce', s: ['bigcommerce\\.com'], g: ['BCData'] },
  { n: 'PrestaShop', c: 'E-commerce', g: ['prestashop'], m: { generator: '^PrestaShop' } },
  { n: 'OpenCart', c: 'E-commerce', s: ['catalog/view/theme/'] },
  { n: 'Salesforce Commerce Cloud', c: 'E-commerce', s: ['demandware\\.static'] },

  // Tag managers & analytics
  { n: 'Google Tag Manager', c: 'Tag manager', s: ['googletagmanager\\.com/gtm\\.js'], g: ['google_tag_manager'] },
  { n: 'Google Analytics', c: 'Analytics', s: ['google-analytics\\.com/(analytics|ga)\\.js', 'googletagmanager\\.com/gtag/js'], g: ['ga', 'gtag', '_gaq'] },
  { n: 'Adobe Analytics', c: 'Analytics', s: ['omniture', 'AppMeasurement', 'adobedtm\\.com'], g: ['s_gi', 'Visitor'] },
  { n: 'Matomo', c: 'Analytics', s: ['matomo\\.(js|php)', 'piwik\\.(js|php)'], g: ['Matomo', '_paq'] },
  { n: 'Plausible', c: 'Analytics', s: ['plausible\\.io/js'], g: ['plausible'] },
  { n: 'Fathom', c: 'Analytics', s: ['cdn\\.usefathom\\.com'], g: ['fathom'] },
  { n: 'Mixpanel', c: 'Analytics', s: ['cdn\\.mxpnl\\.com', 'mixpanel(\\.min)?\\.js'], g: ['mixpanel'] },
  { n: 'Segment', c: 'Analytics', s: ['cdn\\.segment\\.com'] },
  { n: 'Amplitude', c: 'Analytics', s: ['cdn\\.amplitude\\.com'], g: ['amplitude'] },
  { n: 'Heap', c: 'Analytics', s: ['heap-?analytics', 'heapanalytics\\.com'], g: ['heap'] },
  { n: 'PostHog', c: 'Analytics', s: ['posthog'], g: ['posthog'] },
  { n: 'Hotjar', c: 'Analytics', s: ['static\\.hotjar\\.com'], g: ['hj'] },
  { n: 'Microsoft Clarity', c: 'Analytics', s: ['clarity\\.ms'], g: ['clarity'] },
  { n: 'Cloudflare Web Analytics', c: 'Analytics', s: ['static\\.cloudflareinsights\\.com'] },
  { n: 'Vercel Analytics', c: 'Analytics', s: ['/_vercel/insights', 'va\\.vercel-scripts\\.com'] },
  { n: 'Yandex Metrica', c: 'Analytics', s: ['mc\\.yandex\\.ru'], g: ['ym', 'Ya.Metrika'] },
  { n: 'Baidu Analytics', c: 'Analytics', s: ['hm\\.baidu\\.com'] },
  { n: 'Sentry', c: 'Monitoring', s: ['browser\\.sentry-cdn\\.com', 'sentry(\\.min)?\\.js'], g: ['Sentry'] },
  { n: 'Datadog RUM', c: 'Monitoring', s: ['datadoghq-browser-agent', 'datadoghq\\.com'], g: ['DD_RUM'] },
  { n: 'New Relic', c: 'Monitoring', s: ['js-agent\\.newrelic\\.com', 'nr-data\\.net'], g: ['newrelic', 'NREUM'] },
  { n: 'LogRocket', c: 'Monitoring', s: ['cdn\\.logrocket\\.(com|io)'], g: ['LogRocket'] },

  // Advertising & marketing pixels
  { n: 'Meta Pixel', c: 'Advertising', s: ['connect\\.facebook\\.net/.*/fbevents\\.js'], g: ['fbq'] },
  { n: 'Google Ads', c: 'Advertising', s: ['googleadservices\\.com', 'googletagmanager\\.com/gtag/js\\?id=AW-'] },
  { n: 'Google AdSense', c: 'Advertising', s: ['pagead2\\.googlesyndication\\.com'], g: ['adsbygoogle'] },
  { n: 'Google Ad Manager', c: 'Advertising', s: ['securepubads\\.g\\.doubleclick\\.net', 'googletag/js/gpt'], g: ['googletag'] },
  { n: 'LinkedIn Insight Tag', c: 'Advertising', s: ['snap\\.licdn\\.com'], g: ['_linkedin_partner_id'] },
  { n: 'TikTok Pixel', c: 'Advertising', s: ['analytics\\.tiktok\\.com'], g: ['ttq'] },
  { n: 'X (Twitter) Pixel', c: 'Advertising', s: ['static\\.ads-twitter\\.com'], g: ['twq'] },
  { n: 'Pinterest Tag', c: 'Advertising', s: ['s\\.pinimg\\.com/ct/', 'pintrk'], g: ['pintrk'] },
  { n: 'Snap Pixel', c: 'Advertising', s: ['sc-static\\.net/scevent'], g: ['snaptr'] },
  { n: 'Taboola', c: 'Advertising', s: ['cdn\\.taboola\\.com'], g: ['_taboola'] },
  { n: 'Outbrain', c: 'Advertising', s: ['outbrain\\.com'], g: ['OBR'] },
  { n: 'Amazon Ads', c: 'Advertising', s: ['amazon-adsystem\\.com'] },
  { n: 'Criteo', c: 'Advertising', s: ['static\\.criteo\\.net', 'criteo\\.com'] },
  { n: 'Mailchimp', c: 'Marketing', s: ['chimpstatic\\.com', 'list-manage\\.com'] },
  { n: 'Klaviyo', c: 'Marketing', s: ['static\\.klaviyo\\.com'], g: ['klaviyo'] },
  { n: 'HubSpot', c: 'Marketing', s: ['js\\.hs-scripts\\.com', 'js\\.hsforms\\.net', 'js\\.hs-analytics\\.net'], g: ['_hsq', 'hbspt'] },
  { n: 'Marketo', c: 'Marketing', s: ['munchkin\\.marketo\\.net', 'mktoForms'], g: ['Munchkin', 'MktoForms2'] },
  { n: 'Optimizely', c: 'A/B testing', s: ['cdn\\.optimizely\\.com'], g: ['optimizely'] },
  { n: 'VWO', c: 'A/B testing', s: ['dev\\.visualwebsiteoptimizer\\.com'], g: ['_vwo_code', 'VWO'] },

  // Customer support & chat
  { n: 'Intercom', c: 'Customer support', s: ['widget\\.intercom\\.io', 'js\\.intercomcdn\\.com'], g: ['Intercom'] },
  { n: 'Drift', c: 'Customer support', s: ['js\\.driftt\\.com'], g: ['drift'] },
  { n: 'Zendesk', c: 'Customer support', s: ['static\\.zdassets\\.com', 'v2\\.zopim\\.com'], g: ['zE', '$zopim'] },
  { n: 'Crisp', c: 'Customer support', s: ['client\\.crisp\\.chat'], g: ['$crisp'] },
  { n: 'Tawk.to', c: 'Customer support', s: ['embed\\.tawk\\.to'], g: ['Tawk_API'] },
  { n: 'LiveChat', c: 'Customer support', s: ['cdn\\.livechatinc\\.com'], g: ['LiveChatWidget'] },
  { n: 'Freshchat', c: 'Customer support', s: ['wchat\\.freshchat\\.com'], g: ['fcWidget'] },

  // Security, consent, payments, embeds
  { n: 'Cloudflare', c: 'CDN', s: ['/cdn-cgi/', 'cdnjs\\.cloudflare\\.com'] },
  { n: 'jsDelivr', c: 'CDN', s: ['cdn\\.jsdelivr\\.net'] },
  { n: 'unpkg', c: 'CDN', s: ['unpkg\\.com'] },
  { n: 'Amazon CloudFront', c: 'CDN', s: ['cloudfront\\.net'] },
  { n: 'Fastly', c: 'CDN', s: ['fastly\\.net', 'fastly\\.com'] },
  { n: 'Akamai', c: 'CDN', s: ['akamaihd\\.net', 'akamaized\\.net'] },
  { n: 'reCAPTCHA', c: 'Security', s: ['google\\.com/recaptcha', 'gstatic\\.com/recaptcha'], g: ['grecaptcha'] },
  { n: 'hCaptcha', c: 'Security', s: ['hcaptcha\\.com'], g: ['hcaptcha'] },
  { n: 'Cloudflare Turnstile', c: 'Security', s: ['challenges\\.cloudflare\\.com/turnstile'], g: ['turnstile'] },
  { n: 'Cookiebot', c: 'Consent', s: ['consent\\.cookiebot\\.com'], g: ['Cookiebot'] },
  { n: 'OneTrust', c: 'Consent', s: ['cdn\\.cookielaw\\.org', 'onetrust'], g: ['OneTrust', 'OptanonWrapper'] },
  { n: 'Usercentrics', c: 'Consent', s: ['usercentrics\\.eu'], g: ['UC_UI'] },
  { n: 'CookieYes', c: 'Consent', s: ['cdn-cookieyes\\.com', 'cookieyes\\.com'] },
  { n: 'Stripe', c: 'Payments', s: ['js\\.stripe\\.com'], g: ['Stripe'] },
  { n: 'PayPal', c: 'Payments', s: ['paypal\\.com/sdk', 'paypalobjects\\.com'], g: ['paypal'] },
  { n: 'Klarna', c: 'Payments', s: ['klarna\\.com'] },
  { n: 'Razorpay', c: 'Payments', s: ['checkout\\.razorpay\\.com'], g: ['Razorpay'] },
  { n: 'YouTube embed', c: 'Video', s: ['youtube(-nocookie)?\\.com/(embed|iframe_api)'] },
  { n: 'Vimeo', c: 'Video', s: ['player\\.vimeo\\.com'] },
  { n: 'Wistia', c: 'Video', s: ['fast\\.wistia\\.(com|net)'], g: ['Wistia'] },
  { n: 'Google Maps', c: 'Maps', s: ['maps\\.googleapis\\.com', 'maps\\.google\\.com/maps'], g: ['google.maps'] },
  { n: 'Mapbox', c: 'Maps', s: ['api\\.mapbox\\.com'], g: ['mapboxgl'] },
  { n: 'Algolia', c: 'Search', s: ['algolia(net)?\\.(net|com)', 'algoliasearch'], g: ['algoliasearch'] },
  { n: 'Facebook SDK', c: 'Widgets', s: ['connect\\.facebook\\.net/.*/sdk'], g: ['FB'] },
  { n: 'X (Twitter) widgets', c: 'Widgets', s: ['platform\\.twitter\\.com/widgets'], g: ['twttr'] },
  { n: 'Disqus', c: 'Widgets', s: ['disqus\\.com'], g: ['DISQUS'] },
  { n: 'Google Sign-In', c: 'Widgets', s: ['accounts\\.google\\.com/gsi'] },

  // Server frameworks (visible in markup)
  { n: 'Ruby on Rails', c: 'Web framework', d: ['meta[name="csrf-param"]'], m: { 'csrf-param': '^authenticity_token$' } },
  { n: 'Django', c: 'Web framework', d: ['input[name="csrfmiddlewaretoken"]'] },
  { n: 'ASP.NET', c: 'Web framework', d: ['input#__VIEWSTATE', 'form#aspnetForm'] },
  { n: 'Laravel', c: 'Web framework', d: ['input[name="_token"]'], g: ['Laravel'] },
];
