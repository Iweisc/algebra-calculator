const express = require('express');
const cors = require('cors');
const math = require('mathjs');
const path = require('path');
const algebrite = require('algebrite');

// Helper function for polynomial expansion
function expandPolynomial(expression) {
  // Handle special cases like (x+y)^3 or (a+b-c)^2
  const binomialMatch = expression.match(/\(([^)]+)\)\^(\d+)/);
  if (binomialMatch) {
    const [fullMatch, innerExpr, power] = binomialMatch;
    const n = parseInt(power);
    
    // For expressions with more than two terms like (a+b-c)^2
    // We'll use a different approach for multinomials
    if (n === 2) {
      // For squaring, we can use (a+b+c+...)^2 = a^2 + b^2 + c^2 + ... + 2ab + 2ac + 2bc + ...
      try {
        // Parse the inner expression into terms
        const terms = [];
        let currentTerm = '';
        let insideParens = 0;
        
        for (let i = 0; i < innerExpr.length; i++) {
          const char = innerExpr[i];
          
          if (char === '(') insideParens++;
          else if (char === ')') insideParens--;
          
          if ((char === '+' || char === '-') && insideParens === 0 && i > 0) {
            if (currentTerm) terms.push(currentTerm);
            currentTerm = char === '+' ? '' : '-';
          } else {
            currentTerm += char;
          }
        }
        
        if (currentTerm) terms.push(currentTerm);
        
        // If we have more than 2 terms, use the multinomial approach
        if (terms.length > 2) {
          let result = [];
          
          // Add squares of each term
          for (let i = 0; i < terms.length; i++) {
            const term = terms[i].trim();
            if (term) {
              result.push(`(${term})^2`);
            }
          }
          
          // Add cross terms (2ab, 2ac, etc.)
          for (let i = 0; i < terms.length; i++) {
            for (let j = i + 1; j < terms.length; j++) {
              const term1 = terms[i].trim();
              const term2 = terms[j].trim();
              if (term1 && term2) {
                result.push(`2*(${term1})*(${term2})`);
              }
            }
          }
          
          // Use mathjs to simplify the result
          try {
            return math.simplify(result.join('+')).toString();
          } catch (e) {
            return result.join(' + ');
          }
        }
      } catch (e) {
        console.log('Multinomial expansion error:', e);
        // Fall back to binomial handling
      }
    }
    
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

// Helper function to generate step-by-step solutions
function generateSteps(operation, expression, variable = 'x') {
  const steps = [];
  
  try {
    switch (operation) {
      case 'solve':
        // Generate steps for solving equations
        const equationParts = expression.split('=');
        if (equationParts.length !== 2) {
          return [];
        }
        
        const leftSide = equationParts[0].trim();
        const rightSide = equationParts[1].trim();
        
        steps.push(`Start with the equation: ${leftSide} = ${rightSide}`);
        
        // Move all terms with the variable to the left side
        const algebriteExpr = expression.replace(/\*\*/g, '^');
        const collectResult = algebrite.run(`collect(${leftSide} - (${rightSide}), ${variable})`);
        steps.push(`Rearrange to standard form: ${collectResult} = 0`);
        
        // Solve for the variable
        const solveResult = algebrite.run(`solve(${collectResult}, ${variable})`);
        steps.push(`Solve for ${variable}: ${solveResult}`);
        
        return steps;
        
      case 'simplify':
        steps.push(`Start with the expression: ${expression}`);
        
        // Use Algebrite for step-by-step simplification
        const algebriteSimplify = expression.replace(/\*\*/g, '^');
        const simplified = algebrite.simplify(algebriteSimplify).toString();
        steps.push(`Simplify: ${simplified}`);
        
        return steps;
        
      case 'expand':
        steps.push(`Start with the expression: ${expression}`);
        
        // Use Algebrite for expansion
        const algebriteExpand = expression.replace(/\*\*/g, '^');
        const expanded = algebrite.expand(algebriteExpand).toString();
        steps.push(`Expand: ${expanded}`);
        
        return steps;
        
      case 'factor':
        steps.push(`Start with the expression: ${expression}`);
        
        // Use Algebrite for factoring
        const algebriteFactor = expression.replace(/\*\*/g, '^');
        const factored = algebrite.factor(algebriteFactor).toString();
        steps.push(`Factor: ${factored}`);
        
        return steps;
        
      case 'evaluate':
        steps.push(`Start with the expression: ${expression}`);
        
        // Check if there are variables to substitute
        if (expression.includes('@')) {
          const [expr, substitutions] = expression.split('@').map(part => part.trim());
          steps.push(`Substitute values: ${substitutions} into ${expr}`);
          
          // Evaluate with substitutions
          const result = math.evaluate(expression);
          steps.push(`Evaluate: ${result}`);
        } else {
          // Simple evaluation
          const result = math.evaluate(expression);
          steps.push(`Evaluate: ${result}`);
        }
        
        return steps;
        
      default:
        return [];
    }
  } catch (error) {
    console.error('Error generating steps:', error);
    return [];
  }
}

// Routes
app.post('/api/calculate', (req, res) => {
  try {
    const { expression, operation, variable = 'x', steps: wantSteps = false } = req.body;
    
    let result;
    let solutionSteps = [];
    
    // Generate steps if requested
    if (wantSteps) {
      solutionSteps = generateSteps(operation, expression, variable);
    }
    
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
          
          // Try using Algebrite first for more complex equations
          try {
            const algebriteExpr = expression.replace(/\*\*/g, '^');
            const solveResult = algebrite.run(`solve(${leftSide} - (${rightSide}), ${variable})`);
            
            // Format the result
            if (solveResult.toString() !== '[]') {
              result = solveResult.toString().replace(/\[|\]/g, '');
              
              // If multiple solutions, format them nicely
              if (result.includes(',')) {
                const solutions = result.split(',').map(sol => sol.trim());
                result = solutions.join(', ');
              }
              
              break;
            }
          } catch (algebriteError) {
            console.log('Algebrite solving failed:', algebriteError);
          }
          
          // Fall back to mathjs
          const equation = `${leftSide} - (${rightSide})`;
          const solutions = math.solve(equation, variable);
          
          if (Array.isArray(solutions)) {
            result = solutions.join(', ');
          } else {
            result = solutions.toString();
          }
        } catch (error) {
          throw new Error(`Could not solve equation: ${error.message}`);
        }
        break;
        
      case 'simplify':
        try {
          // Try Algebrite first
          const algebriteExpr = expression.replace(/\*\*/g, '^');
          const simplified = algebrite.simplify(algebriteExpr).toString();
          
          if (simplified !== algebriteExpr) {
            result = simplified;
            break;
          }
          
          // Fall back to mathjs
          result = math.simplify(expression).toString();
        } catch (error) {
          throw new Error(`Could not simplify expression: ${error.message}`);
        }
        break;
        
      case 'expand':
        try {
          // Use Algebrite for expansion
          const algebriteExpr = expression.replace(/\*\*/g, '^');
          const expanded = algebrite.expand(algebriteExpr).toString();
          
          result = expanded;
          
          // If Algebrite returns the same expression, try our custom expansion
          if (expanded === algebriteExpr) {
            const customExpansion = expandPolynomial(expression);
            
            if (customExpansion) {
              result = customExpansion;
            } else {
              // Fall back to mathjs
              const expandedExpr = math.parse(expression);
              result = math.simplify(expandedExpr).toString();
            }
          }
        } catch (error) {
          throw new Error(`Could not expand expression: ${error.message}`);
        }
        break;
        
      case 'factor':
        try {
          // Use Algebrite for factoring
          const algebriteExpr = expression.replace(/\*\*/g, '^');
          const factored = algebrite.factor(algebriteExpr).toString();
          
          result = factored;
        } catch (error) {
          result = "Could not factor the expression. Try a different format.";
        }
        break;
        
      case 'evaluate':
        try {
          // Handle expressions with variable substitutions like "2x^2+2y @ x=5, y=3"
          if (expression.includes('@')) {
            result = math.evaluate(expression);
          } else {
            result = math.evaluate(expression);
          }
        } catch (error) {
          throw new Error(`Could not evaluate expression: ${error.message}`);
        }
        break;
        
      case 'graph':
        // For now, just return a message that graphing is not implemented
        result = "Graphing is not implemented in this version.";
        break;
        
      default:
        throw new Error('Invalid operation');
    }
    
    res.json({ 
      result: result.toString(),
      steps: solutionSteps
    });
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
