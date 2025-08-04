// ==UserScript==
// @name         Kinogo.inc Автоматический Пропуск Рекламы
// @namespace    http://tampermonkey.net/
// @version      2.5.0
// @icon            https://github.com/olegfour3/Kinogo-AD-skipper/raw/main/assets/favicon.png
// @updateURL       https://github.com/olegfour3/Kinogo-AD-skipper/raw/main/userscript/kinogo-ad-skipper.user.js
// @downloadURL     https://github.com/olegfour3/Kinogo-AD-skipper/raw/main/userscript/kinogo-ad-skipper.user.js
// @description  Автоматически пропускает VAST рекламу на kinogo сайтах с продвинутым обнаружением
// @author       olegfour3
// @match        https://kinogo.inc/
// @match        https://kinogo.ec/
// @match        https://kinogo.media/
// @match        https://kinogo.org/
// @match        https://kinogo.online/
// @match        https://kinogo.*/*
// @match        https://*.kinogo.*/*
// @match        https://*.allarknow.online/*
// @match        https://*.srv224.com/*
// @match        https://*.adstag0102.xyz/*
// @match        https://*.adstag*.*/*
// @match        https://*.cinemar.cc/*
// @match        https://*.atomics.ws/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log('Kinogo Smart Ad Skipper: Скрипт запущен');

    let config = {
        maxAdDuration: 180, // 3 минуты
        skipOffset: 0.3,    // пропускать за 0.3 сек до конца
        checkInterval: 500, // проверять каждые 0.5 секунды
        debug: false
    };

    let state = {
        isProcessing: false,
        processedVideos: new Set(),
        lastCheck: 0,
        adCount: 0,
        vastPlayer: null,
        rmpVastInstance: null
    };

    function log(message) {
        if (config.debug) {
            console.log(`[Ad Skipper] ${message}`);
        }
    }

    // Перехватываем VAST события
    function interceptVastEvents() {
        // Перехватываем console.log для отслеживания VAST событий
        const originalLog = console.log;
        console.log = function(...args) {
            const message = args.join(' ');
            
            // Обнаруживаем начало рекламы
            if (message.includes('RMP-VAST: API EVENT - adstarted')) {
                log('🎯 VAST реклама началась!');
                setTimeout(() => {
                    const adVideo = findAdVideo();
                    if (adVideo) {
                        skipVastAd(adVideo);
                    }
                }, 100);
            }
            
            // Обнаруживаем информацию о длительности
            if (message.includes('durationAds ')) {
                const duration = parseFloat(message.split('durationAds ')[1]);
                if (duration && duration < config.maxAdDuration * 1000) {
                    log(`📊 Обнаружена VAST реклама длительностью: ${(duration/1000).toFixed(1)}с`);
                }
            }
            
            originalLog.apply(console, args);
        };
    }

    // Функция для скрытия модальных окон
    function hideModalWindows() {
        // Селекторы для поиска модальных окон
        const modalSelectors = [
            '#modalOverlay',
            '.modal-overlay',
            'div[id*="modal"][style*="z-index"]',
            // Новые рекламные блоки
            'ins.0dd30d14',
            'ins.7236739a',
            '.ad-branding',
            '#skin-aaae741d',
            '#brndbe8cdb1fc'
        ];

        modalSelectors.forEach(selector => {
            const modals = document.querySelectorAll(selector);
            modals.forEach(modal => {
                if (modal && modal.style.display !== 'none') {
                    // Проверяем, что это именно то модальное окно с Telegram-чатом или рекламный блок
                    const telegramLink = modal.querySelector('a[href*="t.me"]');
                    const feedbackText = modal.querySelector('#feedbackQuestion');
                    const isAdBlock = modal.classList.contains('0dd30d14') || 
                                     modal.classList.contains('7236739a') || 
                                     modal.classList.contains('ad-branding') ||
                                     modal.id === 'skin-aaae741d' ||
                                     modal.id === 'brndbe8cdb1fc';
                    
                    if (telegramLink || feedbackText || modal.innerHTML.includes('Telegram-чате') || isAdBlock) {
                        const adType = isAdBlock ? 'Рекламный блок' : 'Модальное окно';
                        log(`🚫 Скрываем ${adType}: ${selector}`);
                        modal.style.display = 'none';
                        modal.style.visibility = 'hidden';
                        modal.style.opacity = '0';
                        modal.style.zIndex = '-9999';
                        
                        // Также скрываем overlay если он есть
                        if (modal.classList.contains('modal-overlay') || isAdBlock) {
                            modal.remove();
                        }
                        
                        state.adCount++;
                        showSkipNotification(0, adType);
                    }
                }
            });
        });

        // Дополнительно ищем по содержимому
        const allDivs = document.querySelectorAll('div[style*="z-index"]');
        allDivs.forEach(div => {
            if (div.innerHTML.includes('Telegram-чате') || 
                div.innerHTML.includes('Понравился фильм') ||
                div.innerHTML.includes('более 500 киноманов')) {
                log('🚫 Скрываем модальное окно по содержимому');
                div.style.display = 'none';
                div.style.visibility = 'hidden';
                div.style.opacity = '0';
                
                // Убираем весь родительский контейнер если это overlay
                const overlay = div.closest('.modal-overlay, [class*="overlay"]');
                if (overlay) {
                    overlay.remove();
                } else {
                    div.remove();
                }
            }
        });
    }

    function findAdVideo() {
        // Ищем VAST рекламное видео по различным селекторам
        const adSelectors = [
            '.rmp-ad-vast-video-player',
            'video[src*="adstag"]',
            'video[src*="cdn3.adstag"]',
            '.rmp-ad-container video',
            '.allplay__ads video',
            'video.rmp-ad-vast-video-player',
            // Новые селекторы для плееров
            '.js-player-container video',
            '.video-container video',
            '.kg-video-container video',
            'iframe[src*="cinemar.cc"] video',
            'iframe[src*="allarknow.online"] video',
            'iframe[src*="atomics.ws"] video'
        ];

        for (const selector of adSelectors) {
            const video = document.querySelector(selector);
            if (video && video.duration > 0) {
                log(`🎬 Найдено рекламное видео через селектор: ${selector}`);
                return video;
            }
        }

        // Поиск в iframe, включая новые плееры
        const iframes = document.querySelectorAll('iframe, .js-player-container iframe, .video-container iframe, .kg-video-container iframe');
        for (const iframe of iframes) {
            try {
                // Проверяем src iframe на наличие известных плееров
                const src = iframe.src || iframe.getAttribute('data-src') || '';
                if (src.includes('cinemar.cc') || src.includes('allarknow.online') || src.includes('atomics.ws')) {
                    log(`🎬 Найден iframe плеера: ${src}`);
                }
                
                if (iframe.contentDocument) {
                    for (const selector of adSelectors) {
                        const video = iframe.contentDocument.querySelector(selector);
                        if (video && video.duration > 0) {
                            log(`🎬 Найдено рекламное видео в iframe: ${selector}`);
                            return video;
                        }
                    }
                }
            } catch (e) {
                // Игнорируем ошибки доступа к iframe
            }
        }

        return null;
    }

    function isAdVideo(video) {
        const duration = video.duration;
        const src = video.src || video.currentSrc;
        
        // Основной критерий - длительность меньше 3 минут
        if (duration > 0 && duration < config.maxAdDuration) {
            return true;
        }

        // VAST специфичные признаки
        const vastIndicators = [
            'adstag', 'vast', 'preroll', 'midroll', 'postroll', 
            'ad-', 'ads-', 'advertisement', 'commercial', 'sponsor',
            'rmp-ad', 'allplay__ads',
            // Новые индикаторы
            's2517.com', 'srv224.com', 'doubleclick.net', 'higneursheriven.com',
            'ume0103d1am2dn7.click', 'brndbe8cdb1fc', 'skin-aaae741d'
        ];

        const videoClasses = video.className.toLowerCase();
        const videoId = video.id.toLowerCase();
        const srcLower = src.toLowerCase();

        // Проверяем по классам, ID и src
        if (vastIndicators.some(indicator => 
            videoClasses.includes(indicator) || 
            videoId.includes(indicator) ||
            srcLower.includes(indicator)
        )) {
            return true;
        }

        // Проверяем контейнер видео
        const container = video.closest('.rmp-ad-container, .allplay__ads, [class*="ad-"], [class*="ads-"], [class*="vast"], .ad-branding, .reklama, .zplata, ins.0dd30d14, ins.7236739a');
        if (container) {
            return true;
        }

        // Проверяем по src URL
        if (src.includes('adstag') || src.includes('ads.') || src.includes('/ads/')) {
            return true;
        }

        return false;
    }

    function skipVastAd(video) {
        const duration = video.duration;
        const skipTime = Math.max(0, duration - config.skipOffset);
        
        log(`⚡ Пропускаем VAST рекламу длительностью ${duration.toFixed(1)}с`);
        
        try {
            // Пробуем разные способы пропуска
            video.currentTime = skipTime;
            
            // Дополнительно пытаемся найти и нажать кнопку пропуска
            const skipButtons = [
                '.rmp-ad-container .skip-button',
                '.allplay__skip',
                '[data-allplay="skip"]',
                '.ad-skip-button',
                // Новые кнопки пропуска
                '.js-player-container .skip-button',
                '.video-container .skip-button',
                '.kg-video-container .skip-button',
                '[class*="skip"]',
                '[id*="skip"]'
            ];
            
            for (const selector of skipButtons) {
                const button = document.querySelector(selector);
                if (button && button.offsetParent !== null) {
                    log(`🖱️ Найдена кнопка пропуска: ${selector}`);
                    button.click();
                    break;
                }
            }
            
            state.adCount++;
            
            const videoId = getVideoId(video);
            state.processedVideos.add(videoId);
            
            // Показываем уведомление
            showSkipNotification(duration, 'VAST');
            
        } catch (error) {
            log(`❌ Ошибка при пропуске VAST рекламы: ${error.message}`);
        }
    }

    function skipAd(video) {
        const duration = video.duration;
        const skipTime = Math.max(0, duration - config.skipOffset);
        
        log(`⚡ Пропускаем обычную рекламу длительностью ${duration.toFixed(1)}с`);
        
        video.currentTime = skipTime;
        state.adCount++;
        
        showSkipNotification(duration, 'Обычная');
        
        const videoId = getVideoId(video);
        state.processedVideos.add(videoId);
    }

    function getVideoId(video) {
        return video.src || video.currentSrc || video.outerHTML.substring(0, 100);
    }

    function checkAndSkipAds() {
        if (state.isProcessing) return;
        
        const now = Date.now();
        if (now - state.lastCheck < config.checkInterval) return;
        
        state.lastCheck = now;
        state.isProcessing = true;

        try {
            // Сначала скрываем модальные окна
            hideModalWindows();
            
            // Затем ищем VAST рекламу
            const vastVideo = findAdVideo();
            if (vastVideo && vastVideo.duration > 0 && vastVideo.duration < config.maxAdDuration) {
                const videoId = getVideoId(vastVideo);
                if (!state.processedVideos.has(videoId)) {
                    skipVastAd(vastVideo);
                    return;
                }
            }

            // Затем обычные видео
            const allVideos = findAllVideos();
            
            allVideos.forEach(video => {
                if (!video || video.readyState < 1) return;
                
                const videoId = getVideoId(video);
                if (state.processedVideos.has(videoId)) return;
                
                const duration = video.duration;
                const currentTime = video.currentTime;
                
                if (isNaN(duration) || duration <= 0) return;
                
                log(`🔍 Проверяем видео: ${duration.toFixed(1)}с, позиция: ${currentTime.toFixed(1)}с`);
                
                if (isAdVideo(video)) {
                    skipAd(video);
                } else {
                    // Помечаем как основное видео (не реклама)
                    if (duration > config.maxAdDuration) {
                        state.processedVideos.add(videoId);
                        log(`✅ Основное видео: ${duration.toFixed(1)}с`);
                    }
                }
            });
        } catch (error) {
            log(`❌ Ошибка при проверке: ${error.message}`);
        } finally {
            state.isProcessing = false;
        }
    }

    function findAllVideos() {
        const videos = [];
        
        // Видео в основном документе
        videos.push(...document.querySelectorAll('video'));
        
        // Видео в новых контейнерах плееров
        const playerContainers = document.querySelectorAll('.js-player-container, .video-container, .kg-video-container, .player-container');
        playerContainers.forEach(container => {
            videos.push(...container.querySelectorAll('video'));
        });
        
        // Видео в iframe, включая новые плееры
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(iframe => {
            try {
                if (iframe.contentDocument) {
                    videos.push(...iframe.contentDocument.querySelectorAll('video'));
                }
            } catch (e) {
                // Игнорируем ошибки доступа к iframe
            }
        });
        
        return videos;
    }

    function showSkipNotification(duration, type = 'Реклама') {
        log(`🔔 Показываем уведомление: ${type} (${duration.toFixed(1)}с)`);
        try {
            // Пробуем определить целевой документ (основное окно или текущее)
            let targetDoc, targetBody;
            
            try {
                // Пытаемся получить доступ к родительскому окну
                if (window.top && window.top.document && window.top !== window) {
                    targetDoc = window.top.document;
                    targetBody = targetDoc.body;
                } else {
                    throw new Error('Используем текущее окно');
                }
            } catch (e) {
                // Если нет доступа к родительскому окну, используем текущее
                targetDoc = document;
                targetBody = document.body;
            }
            
            // Удаляем предыдущие уведомления
            const existingNotifications = targetDoc.querySelectorAll('.ad-skip-notification');
            existingNotifications.forEach(n => n.remove());
            
            const notification = targetDoc.createElement('div');
            notification.className = 'ad-skip-notification';
            notification.innerHTML = `
                <div style="
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: linear-gradient(135deg, #28a745, #20c997);
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 14px;
                    font-weight: 500;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    animation: slideIn 0.3s ease-out;
                    border: 1px solid rgba(255,255,255,0.2);
                ">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="font-size: 18px;">⚡</div>
                        <div>
                            <div>${type} пропущена</div>
                            <div style="font-size: 12px; opacity: 0.8;">
                                ${Math.round(duration)}с • Всего: ${state.adCount}
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Добавляем CSS анимации
            if (!targetDoc.querySelector('#ad-skipper-styles')) {
                const styles = targetDoc.createElement('style');
                styles.id = 'ad-skipper-styles';
                styles.textContent = `
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    @keyframes slideOut {
                        from { transform: translateX(0); opacity: 1; }
                        to { transform: translateX(100%); opacity: 0; }
                    }
                `;
                targetDoc.head.appendChild(styles);
            }
            
            targetBody.appendChild(notification);
            log(`✅ Уведомление добавлено в ${targetDoc === document ? 'текущее' : 'родительское'} окно`);

            // Убираем уведомление с анимацией
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.animation = 'slideOut 0.3s ease-in';
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.remove();
                        }
                    }, 300);
                }
            }, 3000);
            
        } catch (error) {
            // Если что-то пошло не так, логируем ошибку
            log(`❌ Ошибка показа уведомления: ${error.message}`);
            
            // Простое уведомление через console для отладки
            console.log(`🎯 Ad Skipper: ${type} пропущена (${Math.round(duration)}с) • Всего: ${state.adCount}`);
        }
    }

    function observeChanges() {
        const observer = new MutationObserver((mutations) => {
            let shouldCheck = false;
            let hasModalChanges = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1) {
                            if (node.tagName === 'VIDEO' || 
                                node.tagName === 'IFRAME' ||
                                (node.querySelector && 
                                 (node.querySelector('video') || node.querySelector('iframe'))) ||
                                (node.className && node.className.includes('rmp-ad'))) {
                                shouldCheck = true;
                            }
                            
                            // Проверяем на модальные окна и рекламные блоки
                            if (node.className && 
                                (node.className.includes('modal') || 
                                 node.className.includes('overlay') ||
                                 node.className.includes('0dd30d14') ||
                                 node.className.includes('7236739a') ||
                                 node.className.includes('ad-branding') ||
                                 node.className.includes('reklama') ||
                                 node.className.includes('zplata')) ||
                                node.id === 'modalOverlay' ||
                                node.id === 'skin-aaae741d' ||
                                node.id === 'brndbe8cdb1fc' ||
                                (node.innerHTML && 
                                 (node.innerHTML.includes('Telegram-чате') || 
                                  node.innerHTML.includes('Понравился фильм') ||
                                  node.innerHTML.includes('s2517.com') ||
                                  node.innerHTML.includes('srv224.com')))) {
                                hasModalChanges = true;
                                log('🔄 Обнаружено новое модальное окно или рекламный блок');
                            }
                        }
                    });
                }
            });

            if (shouldCheck) {
                log('🔄 Обнаружены новые видео элементы');
                setTimeout(checkAndSkipAds, 200);
            } else if (hasModalChanges) {
                // Если появились только модальные окна, скрываем их немедленно
                setTimeout(hideModalWindows, 100);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        return observer;
    }

    function init() {
        log('🚀 Инициализация умного пропуска рекламы...');
        
        // Перехватываем VAST события
        interceptVastEvents();
        
        // Основной цикл проверки (чаще для VAST)
        setInterval(checkAndSkipAds, config.checkInterval);
        
        // Наблюдатель за изменениями DOM
        observeChanges();
        
        // Панель управления убрана по запросу пользователя
        // setTimeout(addControlPanel, 2000);
        
        // Первоначальная проверка
        setTimeout(checkAndSkipAds, 500);
        
        // Дополнительная проверка модальных окон через короткие интервалы
        setTimeout(() => {
            hideModalWindows();
        }, 1000);
        
        log('✅ Умный пропуск рекламы активирован');
        log('📋 Поддерживается: VAST реклама, обычная реклама, RMP плеер, модальные окна');
        log('🆕 Новая поддержка: cinemar.cc, allarknow.online, atomics.ws, рекламные блоки ins.0dd30d14/7236739a');
    }

    // Запуск
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(); 