import * as assert from 'assert';
import {
  buildDuckDuckGoUrl,
  buildWikipediaSearchUrl,
  buildYahooQuoteUrl,
  emptyInstantAnswer,
  formatSearchResults,
  isThinInstantAnswer,
  parseDuckDuckGoResponse,
  parseWikipediaResponse,
  parseYahooQuoteResponse,
  resolveQuoteSymbol,
  resolveWebSearchQuery,
  runWebSearch,
  WEB_SEARCH_TOOL_NAME,
  wikipediaArticleUrl,
  type WebFetch,
  type WebFetchResponse
} from '../../webSearch';

suite('webSearch', () => {
  test('resolves a trimmed query and rejects blank or invalid input', () => {
    assert.strictEqual(resolveWebSearchQuery({ query: '  S&P 500 price  ' }), 'S&P 500 price');
    assert.strictEqual(resolveWebSearchQuery({ query: '' }), undefined);
    assert.strictEqual(resolveWebSearchQuery({ query: '   ' }), undefined);
    assert.strictEqual(resolveWebSearchQuery({}), undefined);
    assert.strictEqual(resolveWebSearchQuery({ query: 42 }), undefined);
    assert.strictEqual(resolveWebSearchQuery(null), undefined);
    assert.strictEqual(resolveWebSearchQuery('query'), undefined);
  });

  test('builds backend URLs with encoded queries', () => {
    assert.strictEqual(
      buildDuckDuckGoUrl('S&P 500'),
      'https://api.duckduckgo.com/?q=S%26P%20500&format=json&no_html=1&skip_disambig=1'
    );
    assert.strictEqual(
      buildWikipediaSearchUrl('S&P 500'),
      'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=S%26P%20500&format=json&srlimit=5'
    );
    assert.strictEqual(
      buildWikipediaSearchUrl('x', 3).endsWith('&srlimit=3'),
      true
    );
    assert.strictEqual(
      buildYahooQuoteUrl('^GSPC'),
      'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1d&range=1d'
    );
  });

  test('parses a full DuckDuckGo instant answer', () => {
    const instant = parseDuckDuckGoResponse({
      Answer: '42',
      AbstractText: 'The answer to everything.',
      AbstractURL: 'https://example.test/answer',
      AbstractSource: 'Example',
      Definition: 'A response.',
      RelatedTopics: [
        { Text: 'First topic', FirstURL: 'https://example.test/1' },
        { Name: 'Group', Topics: [{ Text: 'Nested topic', FirstURL: 'https://example.test/2' }] },
        { Text: '', FirstURL: 'https://example.test/empty' },
        'not-an-object'
      ]
    });
    assert.strictEqual(instant.answer, '42');
    assert.strictEqual(instant.abstractText, 'The answer to everything.');
    assert.strictEqual(instant.abstractUrl, 'https://example.test/answer');
    assert.strictEqual(instant.abstractSource, 'Example');
    assert.strictEqual(instant.definition, 'A response.');
    assert.deepStrictEqual(instant.topics, [
      { text: 'First topic', url: 'https://example.test/1' },
      { text: 'Nested topic', url: 'https://example.test/2' }
    ]);
  });

  test('parseDuckDuckGoResponse degrades malformed payloads to empty', () => {
    assert.deepStrictEqual(parseDuckDuckGoResponse(null), emptyInstantAnswer());
    assert.deepStrictEqual(parseDuckDuckGoResponse('nope'), emptyInstantAnswer());
    assert.deepStrictEqual(parseDuckDuckGoResponse({}), emptyInstantAnswer());
    assert.deepStrictEqual(
      parseDuckDuckGoResponse({ RelatedTopics: 'not-an-array' }),
      emptyInstantAnswer()
    );
  });

  test('parses Wikipedia search results and skips bad entries', () => {
    const results = parseWikipediaResponse({
      query: {
        search: [
          { title: 'S&P 500', snippet: 'the <span class="searchmatch">S</span>&amp;P 500' },
          { title: '', snippet: 'no title' },
          { title: 'List of S&P 500 companies', snippet: '' },
          'not-an-object'
        ]
      }
    });
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].title, 'S&P 500');
    assert.strictEqual(results[0].snippet, 'the S&P 500');
    assert.strictEqual(results[0].url, 'https://en.wikipedia.org/wiki/S%26P_500');
    assert.strictEqual(results[1].snippet, '');
  });

  test('parseWikipediaResponse returns no results for malformed payloads', () => {
    assert.deepStrictEqual(parseWikipediaResponse(null), []);
    assert.deepStrictEqual(parseWikipediaResponse({}), []);
    assert.deepStrictEqual(parseWikipediaResponse({ query: { search: 'nope' } }), []);
  });

  test('wikipediaArticleUrl encodes spaces and special characters', () => {
    assert.strictEqual(
      wikipediaArticleUrl('S&P 500'),
      'https://en.wikipedia.org/wiki/S%26P_500'
    );
  });

  test('parses a Yahoo Finance quote', () => {
    const quote = parseYahooQuoteResponse(
      {
        chart: {
          result: [
            {
              meta: {
                currency: 'USD',
                symbol: '^GSPC',
                regularMarketPrice: 7722.72,
                regularMarketChangePercent: 0.734,
                regularMarketTime: 1790974753,
                exchangeTimezoneName: 'America/New_York'
              }
            }
          ]
        }
      },
      '^GSPC',
      'S&P 500'
    );
    assert.ok(quote);
    assert.strictEqual(quote.symbol, '^GSPC');
    assert.strictEqual(quote.label, 'S&P 500');
    assert.strictEqual(quote.price, 7722.72);
    assert.strictEqual(quote.currency, 'USD');
    assert.strictEqual(quote.changePercent, 0.734);
    assert.strictEqual(quote.marketTime, new Date(1790974753 * 1000).toISOString());
    assert.strictEqual(quote.exchangeTimezone, 'America/New_York');
  });

  test('parseYahooQuoteResponse returns undefined without a usable price', () => {
    assert.strictEqual(parseYahooQuoteResponse(null, '^GSPC', 'S&P 500'), undefined);
    assert.strictEqual(parseYahooQuoteResponse({}, '^GSPC', 'S&P 500'), undefined);
    assert.strictEqual(
      parseYahooQuoteResponse({ chart: { result: [{ meta: { currency: 'USD' } }] } }, 'X', 'X'),
      undefined
    );
    assert.strictEqual(
      parseYahooQuoteResponse(
        { chart: { result: [{ meta: { regularMarketPrice: 'high' } }] } },
        'X',
        'X'
      ),
      undefined
    );
  });

  test('resolveQuoteSymbol maps known names to Yahoo symbols', () => {
    assert.deepStrictEqual(resolveQuoteSymbol('current price of SNP500'), {
      symbol: '^GSPC',
      label: 'S&P 500'
    });
    assert.deepStrictEqual(resolveQuoteSymbol('S&P 500'), { symbol: '^GSPC', label: 'S&P 500' });
    assert.deepStrictEqual(resolveQuoteSymbol('dow jones industrial average today'), {
      symbol: '^DJI',
      label: 'Dow Jones Industrial Average'
    });
    assert.deepStrictEqual(resolveQuoteSymbol('CAC 40'), { symbol: '^FCHI', label: 'CAC 40' });
    assert.deepStrictEqual(resolveQuoteSymbol('gold price'), { symbol: 'GC=F', label: 'Gold' });
    assert.deepStrictEqual(resolveQuoteSymbol('bitcoin'), { symbol: 'BTC-USD', label: 'Bitcoin' });
  });

  test('resolveQuoteSymbol reads $TICKER and "<ticker> stock" patterns', () => {
    assert.deepStrictEqual(resolveQuoteSymbol('price of $aapl'), { symbol: 'AAPL', label: 'AAPL' });
    assert.deepStrictEqual(resolveQuoteSymbol('tsla stock price'), {
      symbol: 'TSLA',
      label: 'TSLA'
    });
  });

  test('resolveQuoteSymbol rejects partial words and stopwords', () => {
    assert.strictEqual(resolveQuoteSymbol('how to downgrade node'), undefined);
    assert.strictEqual(resolveQuoteSymbol('bethel weather'), undefined);
    assert.strictEqual(resolveQuoteSymbol('the stock market today'), undefined);
    assert.strictEqual(resolveQuoteSymbol('paris'), undefined);
    assert.strictEqual(resolveQuoteSymbol(''), undefined);
  });

  test('isThinInstantAnswer detects empty answers', () => {
    assert.strictEqual(isThinInstantAnswer(emptyInstantAnswer()), true);
    assert.strictEqual(
      isThinInstantAnswer({ ...emptyInstantAnswer(), answer: '42' }),
      false
    );
    assert.strictEqual(
      isThinInstantAnswer({
        ...emptyInstantAnswer(),
        topics: [{ text: 't', url: 'https://example.test' }]
      }),
      false
    );
  });

  test('formatSearchResults renders every filled section', () => {
    const text = formatSearchResults('S&P 500', {
      instant: {
        answer: '',
        abstractText: 'A stock market index.',
        abstractUrl: 'https://en.wikipedia.org/wiki/S%26P_500',
        abstractSource: 'Wikipedia',
        definition: '',
        topics: [{ text: 'Related index', url: 'https://example.test/r' }]
      },
      wiki: [],
      quote: {
        symbol: '^GSPC',
        label: 'S&P 500',
        price: 7722.72,
        currency: 'USD',
        changePercent: 0.734,
        marketTime: '2026-10-04T19:00:00.000Z',
        exchangeTimezone: 'America/New_York'
      }
    });
    assert.match(text, /Web search results for "S&P 500"/);
    assert.match(text, /Market quote — S&P 500 \(\^GSPC\): 7,722\.72 USD \(\+0\.73%\)/);
    assert.match(text, /A stock market index\./);
    assert.match(text, /Source: https:\/\/en\.wikipedia\.org\/wiki\/S%26P_500 \(Wikipedia\)/);
    assert.match(text, /Related index/);
  });

  test('formatSearchResults lists Wikipedia results and truncates long text', () => {
    const text = formatSearchResults('hedgehog', {
      instant: { ...emptyInstantAnswer(), abstractText: 'x'.repeat(900) },
      wiki: [
        { title: 'Hedgehog', snippet: 'A spiny mammal.', url: 'https://en.wikipedia.org/wiki/Hedgehog' }
      ]
    });
    assert.match(text, /1\. Hedgehog — https:\/\/en\.wikipedia\.org\/wiki\/Hedgehog/);
    assert.match(text, /A spiny mammal\./);
    assert.match(text, /…\(truncated\)/);
  });

  test('formatSearchResults degrades to a no-results note when empty', () => {
    const text = formatSearchResults('xyzzy-no-such-thing', {
      instant: emptyInstantAnswer(),
      wiki: []
    });
    assert.match(text, /No web results found/);
  });

  test('tool name matches the package.json contribution', () => {
    assert.strictEqual(WEB_SEARCH_TOOL_NAME, 'froggyWebSearch');
  });
});

function stubResponse(body: unknown, ok = true, status = 200): WebFetchResponse {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))
  };
}

suite('runWebSearch', () => {
  const quoteBody = {
    chart: {
      result: [
        {
          meta: {
            currency: 'USD',
            symbol: '^GSPC',
            regularMarketPrice: 7722.72,
            regularMarketChangePercent: 0.5,
            regularMarketTime: 1790974753,
            exchangeTimezoneName: 'America/New_York'
          }
        }
      ]
    }
  };

  test('rich instant answers skip Wikipedia and include the quote', async () => {
    const requested: string[] = [];
    const fetchImpl: WebFetch = (url) => {
      requested.push(url);
      if (url.includes('api.duckduckgo.com')) {
        return Promise.resolve(
          stubResponse({ AbstractText: 'An index.', AbstractURL: 'https://example.test' })
        );
      }
      if (url.includes('query1.finance.yahoo.com')) {
        return Promise.resolve(stubResponse(quoteBody));
      }
      return Promise.resolve(stubResponse({}, false, 404));
    };
    const data = await runWebSearch('S&P 500', fetchImpl);
    assert.strictEqual(data.instant.abstractText, 'An index.');
    assert.strictEqual(data.wiki.length, 0);
    assert.ok(requested.every((url) => !url.includes('wikipedia.org')), 'no Wikipedia call');
    assert.strictEqual(data.quote?.price, 7722.72);
  });

  test('thin instant answers fall back to Wikipedia', async () => {
    const fetchImpl: WebFetch = (url) => {
      if (url.includes('api.duckduckgo.com')) {
        return Promise.resolve(stubResponse({ AbstractText: '', RelatedTopics: [] }));
      }
      if (url.includes('wikipedia.org')) {
        return Promise.resolve(
          stubResponse({ query: { search: [{ title: 'Hedgehog', snippet: 'Spiny.' }] } })
        );
      }
      return Promise.resolve(stubResponse({}, false, 404));
    };
    const data = await runWebSearch('hedgehog', fetchImpl);
    assert.strictEqual(data.instant.abstractText, '');
    assert.strictEqual(data.wiki.length, 1);
    assert.strictEqual(data.wiki[0].title, 'Hedgehog');
    assert.strictEqual(data.quote, undefined);
  });

  test('dead backends degrade to empty data instead of throwing', async () => {
    const failing: WebFetch = () => Promise.reject(new Error('network down'));
    const data = await runWebSearch('anything', failing);
    assert.deepStrictEqual(data.instant, emptyInstantAnswer());
    assert.deepStrictEqual(data.wiki, []);
    assert.strictEqual(data.quote, undefined);
    assert.match(formatSearchResults('anything', data), /No web results found/);
  });

  test('HTTP errors degrade like network failures', async () => {
    const fetchImpl: WebFetch = () => Promise.resolve(stubResponse({}, false, 500));
    const data = await runWebSearch('S&P 500', fetchImpl);
    assert.deepStrictEqual(data.instant, emptyInstantAnswer());
    assert.deepStrictEqual(data.wiki, []);
    assert.strictEqual(data.quote, undefined);
  });
});
