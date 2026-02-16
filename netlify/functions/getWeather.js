// netlify/functions/getWeather.js
const axios = require('axios');
const cheerio = require('cheerio');

// 일본어 날씨 텍스트를 한국어로 완벽하게 변환하는 사전
function translateWeather(text) {
  if (!text) return '정보 없음';
  let result = text;
  
  const dict = {
    '所により': '곳에 따라 ',
    '伴う': ' 동반 ',
    '猛吹雪': '거센 눈보라',
    '暴風雪': '폭풍설',
    '暴風雨': '폭풍우',
    '大雨': '호우',
    '大雪': '대설',
    '小雨': '이슬비',
    '弱雨': '약한 비',
    '強雨': '강한 비',
    '風雪': '눈보라',
    '吹雪': '눈보라',
    '雷雨': '뇌우',
    'みぞれ': '진눈깨비',
    '時々': ' 가끔 ',
    '一時': ' 한때 ',
    'のち': ' 뒤 ',
    '晴れ': '맑음',
    '曇り': '흐림',
    '晴': '맑음',
    '曇': '흐림',
    '雨': '비',
    '雪': '눈',
    '雷': '번개',
    '霧': '안개',
    'か': ' 또는 ',
    'で': '이고 ',
    '・': ' 및 '
  };
  
  for (const [jp, kr] of Object.entries(dict)) {
    result = result.split(jp).join(kr);
  }
  
  return result.trim().replace(/\s+/g, ' ');
}

exports.handler = async function(event, context) {
  const locations = [
    { name: '삿포로', url: 'https://tenki.jp/forecast/1/2/1400/1102/10days.html' },
    { name: '노보리베츠', url: 'https://tenki.jp/forecast/1/4/2100/1230/10days.html' },
    { name: '치토세', url: 'https://tenki.jp/forecast/1/2/1400/1224/10days.html' },
    { name: '비에이', url: 'https://tenki.jp/forecast/1/1/1200/1459/10days.html' } 
  ];

  try {
    const weatherData = await Promise.all(locations.map(async (loc) => {
      try {
        const response = await axios.get(loc.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        const $ = cheerio.load(response.data);
        const forecast5Days = [];
        
        const highElems = $('.high-temp').slice(0, 5);
        const lowElems = $('.low-temp').slice(0, 5);

        highElems.each((i, el) => {
          const highVal = $(el).find('.value').text().trim() || $(el).text().replace(/[^0-9\-]/g, '');
          const lowVal = $(lowElems[i]).find('.value').text().trim() || $(lowElems[i]).text().replace(/[^0-9\-]/g, '');
          
          let weatherText = '';

          const td = $(el).closest('td, th');
          if (td.length > 0) {
            const colIdx = td.index();
            const table = td.closest('table, tbody');
            
            table.find('tr').each((ri, tr) => {
              // 💡 핵심: 진짜 날씨를 이미 찾았다면, 더 이상 밑으로 내려가지 않고 스톱!
              if (weatherText) return; 

              const cell = $(tr).find('td, th').eq(colIdx);
              
              cell.find('img').each((_, img) => {
                const alt = $(img).attr('alt') || $(img).attr('title') || '';
                // 💡 '레이더(レーダー)'나 '정보(情報)' 같은 광고 버튼은 철저하게 무시합니다.
                if (alt.match(/晴|曇|雨|雪|みぞれ|雷/) && !alt.match(/レーダー|情報|実況|分布/)) {
                  weatherText = alt.trim();
                }
              });
              
              if (!weatherText) {
                // 링크(<a>) 태그 안에 있는 텍스트는 아예 빼고 검색해서 오류를 원천 차단합니다.
                const clone = cell.clone();
                clone.find('a').remove();
                const txt = clone.text().replace(/\s+/g, '').trim(); 
                
                if (txt.match(/晴|曇|雨|雪|みぞれ|雷/) && !txt.match(/レーダー|情報|実況|分布/)) {
                  weatherText = txt;
                }
              }
            });
          }

          if (!weatherText) {
             const fallbackWeathers = [];
             $('img').each((idx, img) => {
                const alt = $(img).attr('alt') || '';
                if (alt.match(/晴|曇|雨|雪|みぞれ|雷/) && !alt.match(/レーダー|情報|実況|分布/)) fallbackWeathers.push(alt.trim());
             });
             if (fallbackWeathers[i]) weatherText = fallbackWeathers[i];
          }

          forecast5Days.push({
            dayIndex: i,
            weather: translateWeather(weatherText),
            high: highVal || '-',
            low: lowVal || '-'
          });
        });

        return {
          name: loc.name,
          forecast: forecast5Days
        };
      } catch (innerError) {
        return {
          name: loc.name,
          forecast: [{ dayIndex: 0, weather: '데이터 오류', high: '-', low: '-' }]
        };
      }
    }));

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(weatherData)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '전체 데이터를 불러오는데 실패' })
    };
  }
};