document.addEventListener('DOMContentLoaded', () => {
  // ========== CẤU HÌNH ==========
  const CONFIG = {
    instances: [
      'https://vid.puffyan.us',
      'https://invidious.baczek.me',
      'https://inv.riverside.rocks'
    ],
    videosPerPage: 12,
    maxResults: 60,
    apiTimeout: 10000
  };

  // ========== STATE ==========
  const state = {
    currentInstance: 0,
    currentPage: 1,
    currentQuery: '',
    allVideos: [],
    isLoading: false,
    activeVideoId: null
  };

  // ========== DOM ELEMENTS ==========
  const elements = {
    searchInput: document.getElementById('search-input'),
    searchBtn: document.getElementById('search-btn'),
    resultsContainer: document.getElementById('search-results'),
    videoContainer: document.getElementById('video-container'),
    videoPlayer: document.getElementById('video-player'),
    closePlayerBtn: document.getElementById('close-player'),
    fullscreenBtn: document.getElementById('fullscreen-btn')
  };

  // ========== HÀM CHÍNH ==========
  const api = {
    fetchWithTimeout: async (url, options = {}, timeout = CONFIG.apiTimeout) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    },

    searchVideos: async (query, page = 1) => {
      if (state.allVideos.length >= CONFIG.maxResults) {
        throw new Error(`Đã hiển thị tối đa ${CONFIG.maxResults} kết quả`);
      }

      for (let i = 0; i < CONFIG.instances.length; i++) {
        try {
          const url = `${CONFIG.instances[state.currentInstance]}/api/v1/search?q=${encodeURIComponent(query)}&page=${page}`;
          const response = await api.fetchWithTimeout(url);
          
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          
          const data = await response.json();
          return data.filter(item => item.type === 'video');
        } catch (error) {
          console.error(`Lỗi với instance ${CONFIG.instances[state.currentInstance]}:`, error);
          state.currentInstance = (state.currentInstance + 1) % CONFIG.instances.length;
        }
      }
      throw new Error("Không thể tải dữ liệu từ các server");
    }
  };

  const player = {
    play: (videoId) => {
      state.activeVideoId = videoId;
      elements.videoContainer.classList.add('visible');
      elements.videoPlayer.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
      elements.videoPlayer.scrollIntoView({ behavior: 'smooth' });
    },

    close: () => {
      elements.videoPlayer.src = '';
      elements.videoContainer.classList.remove('visible');
      state.activeVideoId = null;
    },

    toggleFullscreen: () => {
      if (!document.fullscreenElement) {
        elements.videoContainer.requestFullscreen().catch(err => {
          console.error('Lỗi toàn màn hình:', err);
        });
      } else {
        document.exitFullscreen();
      }
    }
  };

  const ui = {
    showLoading: () => {
      elements.resultsContainer.innerHTML = `
        <div class="loading">
          <i class="fas fa-spinner"></i>
          <p>Đang tải...</p>
        </div>
      `;
      state.isLoading = true;
    },

    showError: (message) => {
      elements.resultsContainer.innerHTML = `
        <div class="error">
          <p>${message}</p>
          <button onclick="window.location.reload()">
            <i class="fas fa-sync-alt"></i> Thử lại
          </button>
        </div>
      `;
      state.isLoading = false;
    },

    showWelcome: () => {
      elements.resultsContainer.innerHTML = `
        <div class="welcome-message">
          <i class="fab fa-youtube"></i>
          <p>Nhập từ khóa để bắt đầu tìm kiếm</p>
        </div>
      `;
    },

    displayResults: (videos, append = false) => {
      if (!append) {
        state.allVideos = videos;
        state.currentPage = 1;
        elements.resultsContainer.innerHTML = '';
      }

      const startIdx = 0;
      const endIdx = state.currentPage * CONFIG.videosPerPage;
      const videosToShow = state.allVideos.slice(startIdx, endIdx);

      elements.resultsContainer.innerHTML = videosToShow.map(video => `
        <div class="video-result">
          <div class="video-thumbnail">
            <img src="${video.videoThumbnails?.find(t => t.quality === 'medium')?.url || `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`}" 
                 alt="${video.title}" 
                 loading="lazy">
          </div>
          <div class="video-info">
            <h3 class="video-title">${video.title}</h3>
            <p class="video-author">${video.author}</p>
            <div class="video-actions">
              <button class="btn-play" onclick="app.playVideo('${video.videoId}')">
                <i class="fas fa-play"></i> Phát
              </button>
              <button class="btn-youtube" onclick="window.open('https://youtube.com/watch?v=${video.videoId}', '_blank')">
                <i class="fab fa-youtube"></i> YouTube
              </button>
            </div>
          </div>
        </div>
      `).join('');

      if (state.allVideos.length > endIdx && state.allVideos.length < CONFIG.maxResults) {
        const remaining = Math.min(CONFIG.videosPerPage, CONFIG.maxResults - state.allVideos.length);
        elements.resultsContainer.innerHTML += `
          <div class="load-more-container">
            <button class="load-more-btn" id="load-more">
              <i class="fas fa-plus"></i> Hiển thị thêm ${remaining} video
            </button>
          </div>
        `;
        
        document.getElementById('load-more').addEventListener('click', handlers.loadMore);
      }

      state.isLoading = false;
    }
  };

  const handlers = {
    handleSearch: async () => {
      if (state.isLoading) return;
      
      const query = elements.searchInput.value.trim();
      if (!query) return;

      state.currentQuery = query;
      
      try {
        ui.showLoading();
        const videos = await api.searchVideos(query);
        if (videos.length === 0) throw new Error("Không tìm thấy video");
        ui.displayResults(videos);
      } catch (error) {
        ui.showError(error.message);
      }
    },

    loadMore: async () => {
      if (state.isLoading) return;
      
      try {
        state.isLoading = true;
        document.getElementById('load-more').disabled = true;
        
        const moreVideos = await api.searchVideos(state.currentQuery, state.currentPage + 1);
        state.allVideos = [...state.allVideos, ...moreVideos];
        state.currentPage++;
        
        ui.displayResults(state.allVideos, true);
      } catch (error) {
        ui.showError(error.message);
      }
    },

    handleKeyPress: (e) => {
      if (e.key === 'Enter') {
        handlers.handleSearch();
      }
    }
  };

  // ========== INIT ==========
  const app = {
    init: () => {
      // Event listeners
      elements.searchBtn.addEventListener('click', handlers.handleSearch);
      elements.searchInput.addEventListener('keypress', handlers.handleKeyPress);
      elements.closePlayerBtn.addEventListener('click', player.close);
      elements.fullscreenBtn.addEventListener('click', player.toggleFullscreen);

      // Global functions
      window.app = {
        playVideo: player.play
      };

      ui.showWelcome();
    }
  };

  app.init();
});