import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import MathKeypad from './components/MathKeypad';
import OperationTabs from './components/OperationTabs';
import ExampleLinks from './components/ExampleLinks';

function App() {
  const [expression, setExpression] = useState('');
  const [operation, setOperation] = useState('solve');
  const [result, setResult] = useState('');
  const [steps, setSteps] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [variable, setVariable] = useState('x');
  const [showSteps, setShowSteps] = useState(false);

  // Parse URL query parameters on load
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const queryExpression = queryParams.get('q');
    if (queryExpression) {
      setExpression(decodeURIComponent(queryExpression));
    }
  }, []);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setResult('');
    setSteps([]);
    setLoading(true);
    setShowSteps(false);

    try {
      const res = await axios.post('/api/calculate', { 
        expression, 
        operation,
        variable,
        steps: true
      });
      
      setResult(res.data.result);
      if (res.data.steps) {
        setSteps(res.data.steps);
      }
      
      // Update URL with the current expression
      const url = new URL(window.location);
      url.searchParams.set('q', expression);
      window.history.pushState({}, '', url);
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleOperationChange = (newOperation) => {
    setOperation(newOperation);
    setResult('');
    setSteps([]);
    setError('');
  };

  const handleKeypadInput = (value) => {
    if (value === 'del') {
      setExpression(prev => prev.slice(0, -1));
    } else {
      setExpression(prev => prev + value);
    }
  };

  const handleExampleClick = (exampleExpression) => {
    setExpression(exampleExpression);
    // Auto-detect operation based on the expression
    if (exampleExpression.includes('=')) {
      setOperation('solve');
    } else if (exampleExpression.includes('^') || exampleExpression.includes('(')) {
      setOperation('simplify');
    }
  };

  const toggleKeypad = () => {
    setShowKeypad(!showKeypad);
  };

  const toggleSteps = () => {
    setShowSteps(!showSteps);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>MathPapa-style Algebra Calculator</h1>
      </header>
      
      <main className="calculator-container">
        <OperationTabs 
          activeOperation={operation} 
          onOperationChange={handleOperationChange} 
        />
        
        <form onSubmit={handleSubmit} className="calculator-form">
          <div className="input-container">
            <input
              type="text"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder={operation === 'solve' ? 'x + 2 = 5' : '2x + 3'}
              className="expression-input"
              required
            />
            <button 
              type="button" 
              className="keypad-toggle" 
              onClick={toggleKeypad}
            >
              {showKeypad ? 'Hide Keypad' : 'Show Keypad'}
            </button>
          </div>
          
          {operation === 'solve' && (
            <div className="variable-selector">
              <label>Solve for: </label>
              <select 
                value={variable} 
                onChange={(e) => setVariable(e.target.value)}
              >
                <option value="x">x</option>
                <option value="y">y</option>
                <option value="z">z</option>
                <option value="a">a</option>
                <option value="b">b</option>
              </select>
            </div>
          )}
          
          <button type="submit" className="calculate-btn" disabled={loading}>
            {loading ? 'Calculating...' : 'Calculate it!'}
          </button>
        </form>
        
        {showKeypad && <MathKeypad onKeyPress={handleKeypadInput} />}
        
        {error && <div className="error-message">{error}</div>}
        
        {result !== '' && (
          <div className="result-container">
            <div className="result-header">
              <h3>{operation === 'solve' ? `Solution for ${variable}:` : 'Result:'}</h3>
              {steps.length > 0 && (
                <button 
                  className="steps-toggle-btn" 
                  onClick={toggleSteps}
                >
                  {showSteps ? 'Hide Steps' : 'Show Steps'}
                </button>
              )}
            </div>
            <div className="result">{result}</div>
            
            {showSteps && steps.length > 0 && (
              <div className="steps-container">
                <h4>Step-by-Step Solution:</h4>
                <ol>
                  {steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
        
        <ExampleLinks onExampleClick={handleExampleClick} />
        
        <div className="help-section">
          <h3>How to Use the Calculator</h3>
          <p>Type your algebra problem into the text box above, or use the keypad to enter expressions.</p>
          <p>For example, enter <a href="#" onClick={() => handleExampleClick('3x+2=14')}>3x+2=14</a> to get a step-by-step explanation of how to solve 3x+2=14.</p>
          
          <h4>Math Symbols</h4>
          <ul className="symbols-list">
            <li><strong>+</strong> (Addition)</li>
            <li><strong>-</strong> (Subtraction)</li>
            <li><strong>*</strong> (Multiplication)</li>
            <li><strong>/</strong> (Division)</li>
            <li><strong>^</strong> (Exponent: "raised to the power")</li>
            <li><strong>sqrt</strong> (Square Root) Example: sqrt(9)</li>
          </ul>
        </div>
      </main>
      
      <footer className="App-footer">
        <p>Powered by Algebrite - A symbolic algebra engine</p>
        <p>© 2025 Algebra Calculator</p>
      </footer>
    </div>
  );
}

export default App;
