import React from 'react';
import '../styles/MathKeypad.css';

const MathKeypad = ({ onKeyPress }) => {
  const keys = [
    ['(', ')', '√', '^', '≥', '|'],
    ['7', '8', '9', '÷', '≤', 'x'],
    ['4', '5', '6', '×', '>', 'y'],
    ['1', '2', '3', '−', '<', '.'],
    ['0', ',', '+', 'del', 'space', '=']
  ];

  const handleKeyClick = (key) => {
    let value;
    switch (key) {
      case '×':
        value = '*';
        break;
      case '÷':
        value = '/';
        break;
      case '−':
        value = '-';
        break;
      case '√':
        value = 'sqrt(';
        break;
      case 'space':
        value = ' ';
        break;
      default:
        value = key;
    }
    onKeyPress(value);
  };

  return (
    <div className="math-keypad">
      {keys.map((row, rowIndex) => (
        <div key={rowIndex} className="keypad-row">
          {row.map((key) => (
            <button
              key={key}
              className={`keypad-key ${key === 'del' || key === 'space' ? 'wide-key' : ''}`}
              onClick={() => handleKeyClick(key)}
            >
              {key === 'space' ? 'Space' : key}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};

export default MathKeypad;
