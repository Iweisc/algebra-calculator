import React from 'react';
import '../styles/ExampleLinks.css';

const ExampleLinks = ({ onExampleClick }) => {
  const examples = [
    { text: '1+2', expression: '1+2' },
    { text: '1/3+1/4', expression: '1/3+1/4' },
    { text: '2^3 * 2^2', expression: '2^3 * 2^2' },
    { text: '(x+1)(x+2)', expression: '(x+1)(x+2)' },
    { text: '2x^2+2y @ x=5, y=3', expression: '2x^2+2y @ x=5, y=3' },
    { text: 'y=x^2+1', expression: 'y=x^2+1' },
    { text: '4x+2=2(x+6)', expression: '4x+2=2(x+6)' },
    { text: '(a+b-c)^2', expression: '(a+b-c)^2' },
    { text: 'x^2-4', expression: 'x^2-4' },
    { text: 'sin(x) @ x=pi/4', expression: 'sin(x) @ x=pi/4' },
    { text: 'x^2 @ x=-5:5', expression: 'x^2 @ x=-5:5' }
  ];

  return (
    <div className="example-links">
      <h3>Examples:</h3>
      <div className="examples-container">
        {examples.map((example, index) => (
          <React.Fragment key={index}>
            <a 
              href="#" 
              onClick={(e) => {
                e.preventDefault();
                onExampleClick(example.expression);
              }}
            >
              {example.text}
            </a>
            {index < examples.length - 1 && ', '}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default ExampleLinks;
