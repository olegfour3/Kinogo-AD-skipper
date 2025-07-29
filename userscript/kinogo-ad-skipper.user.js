// ==UserScript==
// @name         Kinogo.inc Автоматический Пропуск Рекламы
// @namespace    http://tampermonkey.net/
// @version      2.3.0
// @icon            https://github.com/olegfour3/Kinogo-AD-skipper/raw/main/assets/favicon.png
// @updateURL       https://github.com/olegfour3/Kinogo-AD-skipper/raw/main/userscript/kinogo-ad-skipper.user.js
// @downloadURL     https://github.com/olegfour3/Kinogo-AD-skipper/raw/main/userscript/kinogo-ad-skipper.user.js
// @description  Автоматически пропускает VAST рекламу на kinogo сайтах с продвинутым обнаружением
// @author       olegfour3
// @match        https://kinogo.*/*
// @match        https://*.kinogo.*/*
// @match        https://*.allarknow.online/*
// @match        https://*.srv224.com/*
// @match        https://*.adstag0102.xyz/*
// @match        https://*.adstag*.*/*
// @grant        none
// ==/UserScript==
(function() {
    'use strict';

    console.log('Kinogo AD Skipper: Скрипт запущен');

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

    function findAdVideo() {
        // Ищем VAST рекламное видео по различным селекторам
        const adSelectors = [
            '.rmp-ad-vast-video-player',
            'video[src*="adstag"]',
            'video[src*="cdn3.adstag"]',
            '.rmp-ad-container video',
            '.allplay__ads video',
            'video.rmp-ad-vast-video-player'
        ];

        for (const selector of adSelectors) {
            const video = document.querySelector(selector);
            if (video && video.duration > 0) {
                log(`🎬 Найдено рекламное видео через селектор: ${selector}`);
                return video;
            }
        }

        // Поиск в iframe
        const iframes = document.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
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
            'rmp-ad', 'allplay__ads'
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
        const container = video.closest('.rmp-ad-container, .allplay__ads, [class*="ad-"], [class*="ads-"], [class*="vast"]');
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
                '.ad-skip-button'
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
            // Сначала ищем VAST рекламу
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
        
        // Видео в iframe
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
            // Определяем целевой документ - всегда пытаемся использовать основное окно
            let targetDoc, targetBody;
            
            // Проверяем, находимся ли мы в iframe
            const isInIframe = window !== window.parent;
            log(`📍 Находимся в iframe: ${isInIframe}`);
            
            if (isInIframe) {
                try {
                    // Пытаемся получить доступ к родительскому окну
                    targetDoc = window.parent.document;
                    targetBody = targetDoc.body;
                    log(`🎯 Используем родительское окно`);
                } catch (e) {
                    log(`❌ Нет доступа к родительскому окну: ${e.message}`);
                    // Если нет доступа, пытаемся через postMessage
                    try {
                        window.parent.postMessage({
                            type: 'AD_SKIPPED',
                            duration: duration,
                            adType: type,
                            count: state.adCount
                        }, '*');
                        log(`📤 Отправлено сообщение в родительское окно`);
                        return;
                    } catch (postError) {
                        log(`❌ Ошибка postMessage: ${postError.message}`);
                        targetDoc = document;
                        targetBody = document.body;
                    }
                }
            } else {
                // Мы в основном окне
                targetDoc = document;
                targetBody = document.body;
                log(`🏠 Используем основное окно`);
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
                        }
                    });
                }
            });

            if (shouldCheck) {
                log('🔄 Обнаружены новые видео элементы');
                setTimeout(checkAndSkipAds, 200);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        return observer;
    }

    function setupMessageListener() {
        // Слушаем сообщения от iframe о пропуске рекламы
        window.addEventListener('message', function(event) {
            if (event.data && event.data.type === 'AD_SKIPPED') {
                log(`📨 Получено сообщение о пропуске рекламы из iframe`);
                const { duration, adType, count } = event.data;
                
                // Создаем уведомление в основном окне
                createNotificationInMainWindow(duration, adType, count);
            }
        });
    }

    function createNotificationInMainWindow(duration, type, count) {
        log(`🔔 Создаем уведомление в основном окне: ${type} (${duration.toFixed(1)}с)`);
        
        // Удаляем предыдущие уведомления
        const existingNotifications = document.querySelectorAll('.ad-skip-notification');
        existingNotifications.forEach(n => n.remove());
        
        const notification = document.createElement('div');
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
                            ${Math.round(duration)}с • Всего: ${count}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Добавляем CSS анимации
        if (!document.querySelector('#ad-skipper-styles')) {
            const styles = document.createElement('style');
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
            document.head.appendChild(styles);
        }
        
        document.body.appendChild(notification);
        log(`✅ Уведомление добавлено в основное окно`);

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
    }

    function init() {
        log('🚀 Инициализация умного пропуска рекламы...');
        
        // Настраиваем слушатель сообщений (только в основном окне)
        if (window === window.parent) {
            setupMessageListener();
            log('📻 Настроен слушатель сообщений в основном окне');
        }
        
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
        
        log('✅ Умный пропуск рекламы активирован');
        log('📋 Поддерживается: VAST реклама, обычная реклама, RMP плеер');
    }

    // Запуск
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(); 