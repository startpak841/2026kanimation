import React from 'react';
import ReactDOM from 'react-dom/client';

// storage 폴리필을 컴포넌트보다 먼저 로드 (window.storage 전역 등록)
import './storage.js';

import BuyerMatchingPlatform from './BuyerMatchingPlatform.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BuyerMatchingPlatform />
  </React.StrictMode>
);
