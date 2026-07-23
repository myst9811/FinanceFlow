import React from 'react';

interface StatsCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative';
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const StatsCard: React.FC<StatsCardProps> = ({ 
  title, 
  value, 
  change, 
  changeType, 
  icon: Icon 
}) => {
  const changeColor = changeType === 'positive' ? 'text-success' : 'text-danger';
  
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {change && (
            <p className={`text-sm ${changeColor}`}>
              {changeType === 'positive' ? '+' : ''}{change}
            </p>
          )}
        </div>
        {Icon && (
          <div className="p-3 bg-primary-50 rounded-full">
            <Icon className="h-6 w-6 text-primary-600" />
          </div>
        )}
      </div>
    </div>
  );
};

export default StatsCard;