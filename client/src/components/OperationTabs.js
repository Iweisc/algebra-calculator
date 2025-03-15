import React from 'react';
import '../styles/OperationTabs.css';

const OperationTabs = ({ activeOperation, onOperationChange }) => {
  const operations = [
    { id: 'solve', label: 'Solve' },
    { id: 'simplify', label: 'Simplify' },
    { id: 'factor', label: 'Factor' },
    { id: 'expand', label: 'Expand' },
    { id: 'evaluate', label: 'Evaluate' },
    { id: 'graph', label: 'Graph' }
  ];

  return (
    <div className="operation-tabs">
      {operations.map(op => (
        <button
          key={op.id}
          className={`tab-button ${activeOperation === op.id ? 'active' : ''}`}
          onClick={() => onOperationChange(op.id)}
        >
          {op.label}
        </button>
      ))}
    </div>
  );
};

export default OperationTabs;
