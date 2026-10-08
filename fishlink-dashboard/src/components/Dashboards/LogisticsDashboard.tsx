import React from 'react';
import { AdminDashboard } from './AdminDashboard';

interface LogisticsDashboardProps {
  onNavigateTab?: (tab: string) => void;
}

// Logistics Dashboard — shows AdminDashboard's Delivery Plans tab
export const LogisticsDashboard: React.FC<LogisticsDashboardProps> = ({ onNavigateTab }) => {
  return <AdminDashboard defaultTab="logistics" onTabChange={onNavigateTab} />;
};
