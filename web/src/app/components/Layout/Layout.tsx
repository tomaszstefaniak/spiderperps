// src/components/Layout/Layout.tsx

import React from 'react';
import './Layout.css';

type LayoutProps = {
  children: React.ReactNode;
  backgroundImage: string;
};

const Layout: React.FC<LayoutProps> = ({ children, backgroundImage }) => {
  return (
    <div className="app-layout">
      <div className="app-background">
        <img src={backgroundImage} className="background-image" alt="Background" />
      </div>
      <div className="app-content">{children}</div>
    </div>
  );
};

export default Layout;

