import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [expression, setExpression] = useState('');
  const [operation, setOperation] = useState('evaluate');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResult('');
    setLoading(true);

    try {
      const res = await axios.post('/api/calculate', { expression, operation });
      setResult(res.data.result);
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Algebra Calculator</h1>
      </header>
      <main className="calculator-container">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="operation">Operation:</label>
            <select
              id="operation"
              value={operation}
              onChange={(e) => setOperation(e.target.value)}
              className="select-operation"
            >
              <option value="evaluate">Evaluate</option>
              <option value="solve">Solve Equation</option>
              <option value="simplify">Simplify</option>
              <option value="expand">Expand</option>
              <option value="factor">Factor</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="expression">
              {operation === 'solve' 
                ? 'Enter equation (e.g., x + 2 = 5):' 
                : 'Enter expression:'}
            </label>
            <input
              type="text"
              id="expression"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              placeholder={operation === 'solve' ? 'x + 2 = 5' : '2x + 3'}
              className="expression-input"
              required
            />
          </div>

          <button type="submit" className="calculate-btn" disabled={loading}>
            {loading ? 'Calculating...' : 'Calculate'}
          </button>
        </form>

        {error && <div className="error-message">{error}</div>}
        
        {result !== '' && (
          <div className="result-container">
            <h3>Result:</h3>
            <div className="result">{result}</div>
          </div>
        )}

        <div className="help-section">
          <h3>Examples:</h3>
          <ul>
            <li><strong>Evaluate:</strong> 2 + 2 * 3</li>
            <li><strong>Solve:</strong> x + 5 = 10</li>
            <li><strong>Simplify:</strong> 2x + 3x</li>
            <li><strong>Expand:</strong> (x+y)^3 or (x+1)^2</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

export default App;
