const express = require('express');
const cors = require('cors');
const math = require('mathjs');
const path = require('path');

// Helper function for polynomial expansion
function expandPolynomial(expression) {
  // Handle special cases like (x+y)^3
  const binomialMatch = expression.match(/\(([^)]+)\)\^(\d+)/);
  if (binomialMatch) {
    const [fullMatch, innerExpr, power] = binomialMatch;
    const n = parseInt(power);
    
    // Check if it's a binomial (has exactly one + or - inside parentheses)
    const terms = innerExpr.split(/([+-])/).filter(t => t.trim());
    
    if ((terms.length === 3 && (terms[1] === '+' || terms[1] === '-')) || 
        (terms.length === 2 && terms[0] === '-')) {
      
      let a, b;
      let isNegative = false;
      
      if (terms.length === 3) {
        a = terms[0];
        b = terms[1] === '+' ? terms[2] : `-${terms[2]}`;
      } else {
        a = '0';
        b = `-${terms[1]}`;
        isNegative = true;
      }
      
      // Apply binomial theorem: (a+b)^n = sum(C(n,k) * a^(n-k) * b^k) for k=0 to n
      let expansion = [];
      
      for (let k = 0; k <= n; k++) {
        // Calculate binomial coefficient C(n,k)
        let coef = 1;
        for (let j = 0; j < k; j++) {
          coef *= (n - j) / (j + 1);
        }
        
        const aPower = n - k;
        const bPower = k;
        
        // Format the term
        let term = '';
        
        // Add coefficient if not 1 (or if it's the only part of the term)
        if (Math.round(coef) !== 1 || (aPower === 0 && bPower === 0)) {
          term += Math.round(coef);
        }
        
        // Add a^(n-k) if aPower > 0
        if (aPower > 0 && a !== '0') {
          const aTerm = a === '1' ? '' : a;
          term += (term && aTerm ? '*' : '') + aTerm + (aPower > 1 ? `^${aPower}` : '');
        }
        
        // Add b^k if bPower > 0
        if (bPower > 0 && b !== '0') {
          const bValue = isNegative ? b : b;
          const bTerm = bValue === '1' || bValue === '-1' ? (bValue === '-1' ? '-' : '') : bValue;
          term += (term && bTerm ? '*' : '') + bTerm + (bPower > 1 ? `^${bPower}` : '');
        }
        
        if (term) {
          expansion.push(term);
        }
      }
      
      return expansion.join(' + ').replace(/\+ -/g, '- ');
    }
  }
  
  // If not a special case, return null to use default handling
  return null;
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.post('/api/calculate', (req, res) => {
  try {
    const { expression, operation } = req.body;
    
    let result;
    
    switch (operation) {
      case 'solve':
        // For solving equations like "x + 2 = 5"
        try {
          // Extract the equation parts
          const equationParts = expression.split('=');
          if (equationParts.length !== 2) {
            throw new Error('Invalid equation format. Use format like "x + 2 = 5"');
          }
          
          const leftSide = equationParts[0].trim();
          const rightSide = equationParts[1].trim();
          
          // Rearrange to standard form: expression = 0
          const equation = `${leftSide} - (${rightSide})`;
          
          // Solve for x
          result = math.solve(equation, 'x');
        } catch (error) {
          throw new Error(`Could not solve equation: ${error.message}`);
        }
        break;
        
      case 'simplify':
        result = math.simplify(expression).toString();
        break;
        
      case 'expand':
        try {
          // Try our custom polynomial expansion first
          const customExpansion = expandPolynomial(expression);
          
          if (customExpansion) {
            result = customExpansion;
          } else {
            // Fall back to mathjs for simpler cases
            const expandedExpr = math.parse(expression);
            result = math.simplify(expandedExpr).toString();
          }
        } catch (error) {
          throw new Error(`Could not expand expression: ${error.message}`);
        }
        break;
        
      case 'factor':
        // mathjs doesn't have direct factoring, so we'll return a message
        result = "Factoring is not directly supported in this version";
        break;
        
      case 'evaluate':
        result = math.evaluate(expression);
        break;
        
      default:
        throw new Error('Invalid operation');
    }
    
    res.json({ result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static('client/build'));
  
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'client', 'build', 'index.html'));
  });
}

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
