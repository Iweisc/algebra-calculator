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
  
  // Preprocess the expression
  const processedExpression = expression
    .replace(/\*\*/g, '^')
    .replace(/(\d)([a-zA-Z])/g, '$1*$2');
  
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
        const algebriteExpr = processedExpression;
        
        // Check equation type to provide appropriate steps
        if (algebriteExpr.includes('^2') || algebriteExpr.includes(`${variable}*${variable}`)) {
          // Quadratic equation steps
          steps.push(`Rearrange to standard form: ${leftSide} - (${rightSide}) = 0`);
          
          const collectResult = algebrite.run(`collect(${leftSide} - (${rightSide}), ${variable})`);
          steps.push(`Collect terms with ${variable}: ${collectResult} = 0`);
          
          // Try to identify standard form a*x^2 + b*x + c = 0
          try {
            const coeffCmd = `coeff(${collectResult}, ${variable}, 2)`;
            const aCoeff = algebrite.run(coeffCmd).toString();
            steps.push(`Identify coefficient a: ${aCoeff}`);
            
            const bCoeffCmd = `coeff(${collectResult}, ${variable}, 1)`;
            const bCoeff = algebrite.run(bCoeffCmd).toString();
            steps.push(`Identify coefficient b: ${bCoeff}`);
            
            const cCoeffCmd = `coeff(${collectResult}, ${variable}, 0)`;
            const cCoeff = algebrite.run(cCoeffCmd).toString();
            steps.push(`Identify coefficient c: ${cCoeff}`);
            
            steps.push(`Apply the quadratic formula: ${variable} = (-b ± √(b^2 - 4ac)) / (2a)`);
            steps.push(`Substitute values: ${variable} = (-${bCoeff} ± √((${bCoeff})^2 - 4*${aCoeff}*${cCoeff})) / (2*${aCoeff})`);
          } catch (e) {
            // If coefficient extraction fails, skip these steps
          }
        } else {
          // Linear equation steps
          const collectResult = algebrite.run(`collect(${leftSide} - (${rightSide}), ${variable})`);
          steps.push(`Rearrange to standard form: ${collectResult} = 0`);
          
          // Try to isolate the variable
          try {
            const coeffCmd = `coeff(${collectResult}, ${variable}, 1)`;
            const coeff = algebrite.run(coeffCmd).toString();
            steps.push(`Identify coefficient of ${variable}: ${coeff}`);
            
            const constantCmd = `coeff(${collectResult}, ${variable}, 0)`;
            const constant = algebrite.run(constantCmd).toString();
            steps.push(`Identify constant term: ${constant}`);
            
            steps.push(`Isolate ${variable} by dividing both sides by ${coeff}: ${variable} = ${constant} / (${coeff})`);
            
            // Try to simplify the final result
            const simplifiedResult = algebrite.run(`simplify(${constant} / (${coeff}))`).toString();
            steps.push(`Simplify: ${variable} = ${simplifiedResult}`);
          } catch (e) {
            // If coefficient extraction fails, use a simpler approach
            const solveResult = algebrite.run(`solve(${collectResult}, ${variable})`);
            steps.push(`Solve for ${variable}: ${solveResult}`);
          }
        }
        
        return steps;
        
      case 'simplify':
        steps.push(`Start with the expression: ${expression}`);
        
        // Use Algebrite for step-by-step simplification
        const algebriteSimplify = processedExpression;
        
        // Check if there are fractions to provide appropriate steps
        if (expression.includes('/')) {
          steps.push(`Find a common denominator for all fractions`);
          
          const rationalized = algebrite.run(`rationalize(${algebriteSimplify})`).toString();
          steps.push(`Combine fractions: ${rationalized}`);
          
          const simplified = algebrite.simplify(rationalized).toString();
          steps.push(`Simplify the result: ${simplified}`);
        } 
        // Check if there are like terms to combine
        else if ((expression.match(/[a-zA-Z]/g) || []).length > 1) {
          steps.push(`Combine like terms`);
          
          const collected = algebrite.run(`collect(${algebriteSimplify}, ${variable})`).toString();
          steps.push(`Collect terms with ${variable}: ${collected}`);
          
          const simplified = algebrite.simplify(collected).toString();
          steps.push(`Simplify the result: ${simplified}`);
        }
        // Default simplification
        else {
          const simplified = algebrite.simplify(algebriteSimplify).toString();
          steps.push(`Apply algebraic rules to simplify: ${simplified}`);
        }
        
        return steps;
        
      case 'expand':
        steps.push(`Start with the expression: ${expression}`);
        
        // Use Algebrite for expansion with more detailed steps
        const algebriteExpand = processedExpression;
        
        // Check if it's a binomial expansion
        if (expression.match(/\([^)]+\)\^(\d+)/)) {
          const match = expression.match(/\(([^)]+)\)\^(\d+)/);
          if (match) {
            const [_, innerExpr, power] = match;
            steps.push(`Apply the binomial theorem to (${innerExpr})^${power}`);
            
            // For power of 2, show FOIL method
            if (power === '2') {
              steps.push(`Use FOIL method: First, Outer, Inner, Last terms`);
            }
          }
        } 
        // Check if it's a product of binomials
        else if (expression.match(/\([^)]+\)\s*\([^)]+\)/)) {
          steps.push(`Multiply the terms using the distributive property`);
        }
        
        // Show the expansion
        const expanded = algebrite.expand(algebriteExpand).toString();
        steps.push(`Result after expansion: ${expanded}`);
        
        // If there are like terms, show combining them
        if (expanded.split('+').length > 1) {
          const collected = algebrite.run(`collect(${expanded}, ${variable})`).toString();
          steps.push(`Combine like terms: ${collected}`);
        }
        
        return steps;
        
      case 'factor':
        steps.push(`Start with the expression: ${expression}`);
        
        // Use Algebrite for factoring with more detailed steps
        const algebriteFactor = processedExpression;
        
        // Check if it's a quadratic expression
        if (expression.includes('^2') || expression.includes(`${variable}*${variable}`)) {
          steps.push(`Identify if this is a perfect square trinomial or difference of squares`);
          
          // Try to get coefficients
          try {
            const aCoeff = algebrite.run(`coeff(${algebriteFactor}, ${variable}, 2)`).toString();
            const bCoeff = algebrite.run(`coeff(${algebriteFactor}, ${variable}, 1)`).toString();
            const cCoeff = algebrite.run(`coeff(${algebriteFactor}, ${variable}, 0)`).toString();
            
            steps.push(`Write in standard form: ${aCoeff}${variable}^2 + ${bCoeff}${variable} + ${cCoeff}`);
            
            // Check for difference of squares: a^2 - b^2
            if (bCoeff === '0' && parseFloat(cCoeff) < 0) {
              steps.push(`This appears to be a difference of squares pattern: a^2 - b^2 = (a+b)(a-b)`);
            }
            // Check for perfect square: a^2 + 2ab + b^2
            else if (Math.pow(parseFloat(bCoeff), 2) === 4 * parseFloat(aCoeff) * parseFloat(cCoeff)) {
              steps.push(`This appears to be a perfect square trinomial: a^2 + 2ab + b^2 = (a+b)^2`);
            }
            // General factoring approach
            else {
              steps.push(`Find two numbers that multiply to ${aCoeff}*${cCoeff} = ${parseFloat(aCoeff) * parseFloat(cCoeff)} and add up to ${bCoeff}`);
            }
          } catch (e) {
            // If coefficient extraction fails, skip these steps
          }
        }
        
        // Show the factorization
        const factored = algebrite.factor(algebriteFactor).toString();
        steps.push(`Result after factoring: ${factored}`);
        
        return steps;
        
      case 'evaluate':
        steps.push(`Start with the expression: ${expression}`);
        
        // Check if there are variables to substitute
        if (expression.includes('@')) {
          const [expr, substitutions] = expression.split('@').map(part => part.trim());
          steps.push(`Substitute values: ${substitutions} into ${expr}`);
          
          // Break down the substitution process
          const subParts = substitutions.split(',');
          let currentExpr = expr;
          
          for (const subPart of subParts) {
            const [varName, value] = subPart.split('=').map(s => s.trim());
            steps.push(`Replace ${varName} with ${value}`);
            
            // Show the expression after each substitution
            try {
              const afterSub = currentExpr.replace(new RegExp(varName, 'g'), `(${value})`);
              currentExpr = afterSub;
              steps.push(`Expression becomes: ${currentExpr}`);
            } catch (e) {
              // Skip if regex replacement fails
            }
          }
          
          // Evaluate the final expression
          try {
            const result = math.evaluate(expression);
            steps.push(`Simplify and calculate: ${result}`);
          } catch (e) {
            // If mathjs fails, try with Algebrite
            try {
              const algebriteResult = algebrite.run(`float(${currentExpr})`).toString();
              steps.push(`Simplify and calculate: ${algebriteResult}`);
            } catch (algebriteError) {
              steps.push(`Unable to calculate the final result`);
            }
          }
        } else {
          // Simple evaluation
          try {
            const result = math.evaluate(expression);
            steps.push(`Calculate: ${result}`);
          } catch (e) {
            // If mathjs fails, try with Algebrite
            try {
              const algebriteResult = algebrite.run(`float(${processedExpression})`).toString();
              steps.push(`Calculate: ${algebriteResult}`);
            } catch (algebriteError) {
              steps.push(`Unable to calculate the result`);
            }
          }
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
    
    // Preprocess the expression to handle common formats
    let processedExpression = expression
      .replace(/\*\*/g, '^')      // Replace ** with ^ for exponentiation
      .replace(/(\d)([a-zA-Z])/g, '$1*$2'); // Add * between numbers and variables (e.g., 2x -> 2*x)
    
    switch (operation) {
      case 'solve':
        // For solving equations like "x + 2 = 5"
        try {
          // Extract the equation parts
          const equationParts = processedExpression.split('=');
          if (equationParts.length !== 2) {
            throw new Error('Invalid equation format. Use format like "x + 2 = 5"');
          }
          
          const leftSide = equationParts[0].trim();
          const rightSide = equationParts[1].trim();
          
          // Try using Algebrite first for more complex equations
          try {
            // First try direct solve
            let solveCmd = `solve(${leftSide} - (${rightSide}), ${variable})`;
            let solveResult = algebrite.run(solveCmd);
            
            // If that fails, try with nroots for polynomial equations
            if (solveResult.toString() === '[]') {
              solveCmd = `nroots(${leftSide} - (${rightSide}))`;
              solveResult = algebrite.run(solveCmd);
            }
            
            // Format the result
            if (solveResult.toString() !== '[]') {
              result = solveResult.toString().replace(/\[|\]/g, '');
              
              // If multiple solutions, format them nicely
              if (result.includes(',')) {
                const solutions = result.split(',').map(sol => sol.trim());
                result = solutions.join(', ');
              }
              
              // Try to simplify the result if it looks complex
              if (result.includes('i') || result.includes('sqrt')) {
                try {
                  const simplifiedResult = algebrite.run(`simplify(${result})`).toString();
                  if (simplifiedResult.length < result.length) {
                    result = simplifiedResult;
                  }
                } catch (e) {
                  // Keep original result if simplification fails
                }
              }
              
              break;
            }
          } catch (algebriteError) {
            console.log('Algebrite solving failed:', algebriteError);
          }
          
          // Try another Algebrite approach for specific equation types
          try {
            // For quadratic and other polynomial equations
            if (processedExpression.includes('^2') || processedExpression.includes(`${variable}*${variable}`)) {
              const polyCmd = `roots(${leftSide} - (${rightSide}), ${variable})`;
              const polyResult = algebrite.run(polyCmd);
              
              if (polyResult.toString() !== '[]') {
                result = polyResult.toString().replace(/\[|\]/g, '');
                break;
              }
            }
          } catch (e) {
            console.log('Polynomial solving failed:', e);
          }
          
          // Fall back to mathjs
          try {
            const equation = `${leftSide} - (${rightSide})`;
            const solutions = math.solve(equation, variable);
            
            if (Array.isArray(solutions) && solutions.length > 0) {
              result = solutions.join(', ');
            } else if (solutions) {
              result = solutions.toString();
            } else {
              throw new Error('No solutions found');
            }
          } catch (mathError) {
            // If mathjs fails too, return a more helpful message
            throw new Error(`Could not solve equation. Try simplifying your equation first.`);
          }
        } catch (error) {
          throw new Error(`Could not solve equation: ${error.message}`);
        }
        break;
        
      case 'simplify':
        try {
          // Try multiple Algebrite approaches for simplification
          try {
            // First try standard simplify
            let simplified = algebrite.simplify(processedExpression).toString();
            
            // If that doesn't change much, try rationalize for fractions
            if (simplified === processedExpression || 
                Math.abs(simplified.length - processedExpression.length) < 3) {
              const rationalized = algebrite.run(`rationalize(${processedExpression})`).toString();
              if (rationalized !== processedExpression && 
                  rationalized !== '0' && 
                  rationalized.length < simplified.length * 1.5) {
                simplified = rationalized;
              }
            }
            
            // Try another approach for expressions with roots
            if (processedExpression.includes('sqrt')) {
              const withoutRadicals = algebrite.run(`rationalize(${processedExpression})`).toString();
              if (withoutRadicals !== processedExpression && 
                  withoutRadicals !== '0' && 
                  withoutRadicals.length < simplified.length * 1.5) {
                simplified = withoutRadicals;
              }
            }
            
            result = simplified;
          } catch (algebriteError) {
            console.log('Algebrite simplification failed:', algebriteError);
            // Fall back to mathjs
            result = math.simplify(expression).toString();
          }
        } catch (error) {
          throw new Error(`Could not simplify expression: ${error.message}`);
        }
        break;
        
      case 'expand':
        try {
          // Use Algebrite for expansion with multiple approaches
          try {
            // First try standard expand
            let expanded = algebrite.expand(processedExpression).toString();
            
            // If that doesn't work well, try a different approach
            if (expanded === processedExpression) {
              // For expressions with multiple terms in parentheses
              if (processedExpression.includes('(') && processedExpression.includes(')')) {
                // Try multiplying out first
                const multipliedOut = algebrite.run(`multiply(${processedExpression})`).toString();
                if (multipliedOut !== processedExpression) {
                  expanded = algebrite.expand(multipliedOut).toString();
                }
              }
            }
            
            // If still no change, try our custom expansion
            if (expanded === processedExpression) {
              const customExpansion = expandPolynomial(expression);
              if (customExpansion) {
                expanded = customExpansion;
              }
            }
            
            // If still no change, try one more approach with mathjs
            if (expanded === processedExpression) {
              try {
                const expandedExpr = math.parse(expression);
                expanded = math.simplify(expandedExpr).toString();
              } catch (e) {
                // Keep the original if mathjs fails
              }
            }
            
            result = expanded;
          } catch (algebriteError) {
            console.log('Algebrite expansion failed:', algebriteError);
            
            // Try our custom expansion
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
          // Use Algebrite for factoring with multiple approaches
          try {
            // First try standard factor
            let factored = algebrite.factor(processedExpression).toString();
            
            // If that doesn't change anything, try factoring over complex numbers
            if (factored === processedExpression) {
              const complexFactored = algebrite.run(`factor(${processedExpression}, i)`).toString();
              if (complexFactored !== processedExpression) {
                factored = complexFactored;
              }
            }
            
            // If still no change, try another approach for specific forms
            if (factored === processedExpression && processedExpression.includes('^2')) {
              // Try to identify perfect square trinomials
              const perfectSquareCmd = `factor_perfect_square(${processedExpression})`;
              try {
                const perfectSquare = algebrite.run(perfectSquareCmd).toString();
                if (perfectSquare !== processedExpression && perfectSquare !== '0') {
                  factored = perfectSquare;
                }
              } catch (e) {
                // Continue with original factorization
              }
            }
            
            // If it's a polynomial, try polynomial factorization
            if (factored === processedExpression) {
              try {
                const polyFactorCmd = `factorpoly(${processedExpression}, ${variable})`;
                const polyFactor = algebrite.run(polyFactorCmd).toString();
                if (polyFactor !== processedExpression && polyFactor !== '0') {
                  factored = polyFactor;
                }
              } catch (e) {
                // Continue with original factorization
              }
            }
            
            result = factored;
            
            // If result is still the same as input, provide a more helpful message
            if (result === processedExpression) {
              result = "Expression may already be in factored form or cannot be factored further with current methods.";
            }
          } catch (algebriteError) {
            console.log('Algebrite factoring failed:', algebriteError);
            result = "Could not factor the expression. Try a different format.";
          }
        } catch (error) {
          result = "Could not factor the expression. Try a different format.";
        }
        break;
        
      case 'evaluate':
        try {
          // Handle expressions with variable substitutions like "2x^2+2y @ x=5, y=3"
          if (expression.includes('@')) {
            // Parse the expression and substitutions
            const [expr, substitutions] = expression.split('@').map(part => part.trim());
            
            // Create a scope object with the substitutions
            const scope = {};
            substitutions.split(',').forEach(sub => {
              const [varName, value] = sub.split('=').map(s => s.trim());
              scope[varName] = parseFloat(value) || value; // Convert to number if possible
            });
            
            // Try to evaluate with mathjs first
            try {
              result = math.evaluate(expr, scope);
            } catch (mathError) {
              // If mathjs fails, try with Algebrite
              let algebriteExpr = expr;
              
              // Build substitution string for Algebrite
              const subStrings = Object.entries(scope).map(([key, val]) => `${key}=${val}`);
              const algebriteCmd = `subst(${subStrings.join(',')},${algebriteExpr})`;
              
              try {
                const substituted = algebrite.run(algebriteCmd).toString();
                result = algebrite.run(`float(${substituted})`).toString();
              } catch (e) {
                throw mathError; // If Algebrite also fails, throw the original error
              }
            }
          } else {
            // For direct evaluation without substitutions
            try {
              result = math.evaluate(expression);
            } catch (mathError) {
              // Try with Algebrite if mathjs fails
              try {
                result = algebrite.run(`float(${processedExpression})`).toString();
              } catch (e) {
                throw mathError;
              }
            }
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
