import React from 'react';

interface ErrorAlertProps {
  errorMessage: string | null;
  dismissible?: boolean;
  onDismiss?: () => void;
}

/**
 * A reusable error alert component that displays error messages
 * 
 * @param errorMessage - The error message to display
 * @param dismissible - Whether the alert can be dismissed (optional)
 * @param onDismiss - Callback function when the alert is dismissed (optional)
 */
const ErrorAlert: React.FC<ErrorAlertProps> = ({ 
  errorMessage, 
  dismissible = false,
  onDismiss
}) => {
  if (!errorMessage) return null;
  
  return (
    <div 
      style={{
        backgroundColor: '#fde2e2',
        color: '#b91c1c',
        padding: '12px 16px',
        borderRadius: '4px',
        border: '1px solid #f87171',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}
      role="alert"
      aria-live="assertive"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="20" 
          height="20" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>
          <strong style={{ fontWeight: 'bold', marginRight: '4px' }}>Error:</strong>
          {errorMessage}
        </div>
      </div>
      
      {dismissible && onDismiss && (
        <button 
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            color: '#b91c1c',
            padding: '4px'
          }}
          aria-label="Dismiss error"
        >
          ×
        </button>
      )}
    </div>
  );
};

export default ErrorAlert;
