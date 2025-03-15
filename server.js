const express = require('express');
const cors = require('cors');
const math = require('mathjs');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();
// We'll use math.js more extensively and rely less on Algebrite
const algebrite = require('algebrite');

// Suppress deprecation warnings
process.env.NODE_NO_WARNINGS = 1;

// Wolfram Alpha API configuration
const WOLFRAM_APP_ID = process.env.WOLFRAM_APP_ID;
const WOLFRAM_API_URL = 'https://api.wolframalpha.com/v2/query';

// Function to query Wolfram Alpha API
async function queryWolframAlpha(input, format = 'plaintext') {
  try {
    const params = new URLSearchParams({
      input,
      appid: WOLFRAM_APP_ID,
      format,
      output: 'json',
    });
    
    const response = await fetch(`${WOLFRAM_API_URL}?${params}`);
    if (!response.ok) {
      throw new Error(`Wolfram Alpha API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error querying Wolfram Alpha:', error);
    throw error;
  }
}

// Helper function to extract result from Wolfram Alpha response
function extractWolframResult(data, podTitle) {
  try {
    if (!data.queryresult || data.queryresult.error) {
      return null;
    }
    
    const pods = data.queryresult.pods;
    if (!pods) return null;
    
    const targetPod = pods.find(pod => pod.title === podTitle);
    if (!targetPod || !targetPod.subpods || targetPod.subpods.length === 0) {
      return null;
    }
    
    return targetPod.subpods[0].plaintext;
  } catch (error) {
    console.error('Error extracting Wolfram result:', error);
    return null;
  }
}

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
app.post('/api/calculate', async (req, res) => {
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
      .replace(/(\d)([a-zA-Z])/g, '$1*$2') // Add * between numbers and variables (e.g., 2x -> 2*x)
      .replace(/([a-zA-Z])(\d)/g, '$1^$2') // Convert x2 to x^2 for convenience
      .replace(/([a-zA-Z])\(/g, '$1*('); // Add * between variables and parentheses (e.g., x(y+1) -> x*(y+1))
    
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
          
          // Try Wolfram Alpha for complex equations first
          if (WOLFRAM_APP_ID && (
              expression.includes('^3') || 
              expression.includes('^4') || 
              expression.includes('sqrt') || 
              (expression.match(/[a-zA-Z]/g) || []).length > 1)) {
            try {
              const wolframQuery = `solve ${expression} for ${variable}`;
              const wolframData = await queryWolframAlpha(wolframQuery);
              const wolframResult = extractWolframResult(wolframData, 'Solution');
              
              if (wolframResult) {
                result = wolframResult.replace(/\s+/g, ' ').trim();
                break;
              }
            } catch (wolframError) {
              console.log('Wolfram Alpha solving failed:', wolframError);
            }
          }
          
          // Try using math.js if Wolfram Alpha fails or isn't available
          try {
            // For simple equations, try direct approach
            if (!processedExpression.includes('^') && 
                !processedExpression.includes('*') && 
                processedExpression.split(variable).length <= 3) {
              
              // Rearrange to standard form: ax + b = 0
              const equation = `${leftSide} - (${rightSide})`;
              
              // Try to extract the coefficient and constant
              const simplified = math.simplify(equation).toString();
              
              // Extract variable term and constant
              const varTermMatch = simplified.match(new RegExp(`([+-]?\\s*[0-9.]*\\s*\\*?\\s*${variable})`, 'g'));
              const constMatch = simplified.match(/([+-]?\s*[0-9.]+)(?!\s*\*?\s*[a-zA-Z])/g);
              
              if (varTermMatch && constMatch) {
                const varCoeff = math.evaluate(varTermMatch[0].replace(variable, '1'));
                const constTerm = math.evaluate(constMatch[0]);
                
                if (varCoeff !== 0) {
                  result = (-constTerm / varCoeff).toString();
                  break;
                }
              }
            }
            
            // If simple approach fails, try using Algebrite directly
            // as math.simplify with context is not reliable
          } catch (mathError) {
            console.log('Math.js solving failed:', mathError);
          }
          
          // If math.js fails, try using Algebrite
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
          
          // Try a more direct approach with math.js
          try {
            // For linear equations: ax + b = c
            if (!processedExpression.includes('^') && !processedExpression.includes('*' + variable + '*' + variable)) {
              // Create a scope with all variables except the one we're solving for
              const scope = {};
              const node = math.parse(`${leftSide} - (${rightSide})`);
              const symbols = node.filter(node => node.isSymbolNode && node.name !== variable);
              
              // Extract symbols and set them to zero in the scope
              symbols.forEach(symbol => {
                if (symbol.name !== variable) {
                  scope[symbol.name] = 0;
                }
              });
              
              // Try to solve the equation
              const simplified = math.simplify(`${leftSide} - (${rightSide})`, scope);
              const coeffNode = math.parse(simplified.toString().replace(new RegExp(`${variable}`, 'g'), '1'));
              const constNode = math.parse(simplified.toString().replace(new RegExp(`[+-]?\\s*[0-9.]*\\s*\\*?\\s*${variable}`, 'g'), '0'));
              
              const coeff = math.evaluate(coeffNode, scope);
              const constant = math.evaluate(constNode, scope);
              
              if (coeff !== 0) {
                result = math.format(-constant / coeff, {precision: 14});
                break;
              }
            }
            
            // For quadratic equations: ax^2 + bx + c = 0
            if (processedExpression.includes('^2') || processedExpression.includes(`${variable}*${variable}`)) {
              const equation = `${leftSide} - (${rightSide})`;
              
              // Try to extract coefficients
              const expr = math.simplify(equation);
              const exprStr = expr.toString();
              
              // Extract coefficients using regex
              const aMatch = exprStr.match(new RegExp(`([+-]?\\s*[0-9.]*\\s*\\*?\\s*${variable}\\s*\\^\\s*2)`, 'g'));
              const bMatch = exprStr.match(new RegExp(`([+-]?\\s*[0-9.]*\\s*\\*?\\s*${variable}(?!\\s*\\^))`, 'g'));
              const cMatch = exprStr.match(new RegExp(`([+-]?\\s*[0-9.]+)(?!\\s*\\*?\\s*${variable})`, 'g'));
              
              if (aMatch) {
                const a = math.evaluate(aMatch[0].replace(new RegExp(`\\*?\\s*${variable}\\s*\\^\\s*2`, 'g'), '')) || 1;
                const b = bMatch ? math.evaluate(bMatch[0].replace(new RegExp(`\\*?\\s*${variable}`, 'g'), '')) || 1 : 0;
                const c = cMatch ? math.evaluate(cMatch[0]) : 0;
                
                // Apply quadratic formula
                const discriminant = b * b - 4 * a * c;
                
                if (discriminant >= 0) {
                  const x1 = (-b + Math.sqrt(discriminant)) / (2 * a);
                  const x2 = (-b - Math.sqrt(discriminant)) / (2 * a);
                  
                  if (x1 === x2) {
                    result = x1.toString();
                  } else {
                    result = `${x1}, ${x2}`;
                  }
                  break;
                } else {
                  // Complex roots
                  const realPart = -b / (2 * a);
                  const imagPart = Math.sqrt(-discriminant) / (2 * a);
                  result = `${realPart} + ${imagPart}i, ${realPart} - ${imagPart}i`;
                  break;
                }
              }
            }
            
            // If we get here, try one more approach with math.js
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
            // If all approaches fail, return a more helpful message
            throw new Error(`Could not solve equation. Try simplifying your equation first.`);
          }
        } catch (error) {
          throw new Error(`Could not solve equation: ${error.message}`);
        }
        break;
        
      case 'simplify':
        try {
          // Try Wolfram Alpha for complex simplifications first
          if (WOLFRAM_APP_ID && (
              expression.includes('^3') || 
              expression.includes('^4') || 
              expression.includes('sqrt') || 
              expression.includes('a') && expression.includes('b'))) {
            try {
              const wolframQuery = `simplify ${expression}`;
              const wolframData = await queryWolframAlpha(wolframQuery);
              const wolframResult = extractWolframResult(wolframData, 'Result');
              
              if (wolframResult) {
                result = wolframResult.replace(/\s+/g, ' ').trim();
                break;
              }
            } catch (wolframError) {
              console.log('Wolfram Alpha simplification failed:', wolframError);
            }
          }
          
          // Try math.js if Wolfram Alpha fails or isn't available
          try {
            // Always use Algebrite for symbolic expressions to avoid undefined variable errors
            const hasSymbolicVars = /[a-zA-Z]/.test(processedExpression);
            
            if (hasSymbolicVars) {
              // For symbolic expressions with variables, use Algebrite
              const algebriteResult = algebrite.simplify(processedExpression).toString();
              result = algebriteResult;
              break;
            }
            
            // For other expressions, use math.js
            const node = math.parse(processedExpression);
            
            // Apply various simplification rules
            const simplified = math.simplify(node, [
              'n1*n2 -> n1*n2', // Multiply numbers
              'n1/n2 -> n1/n2', // Divide numbers
              'n1+n2 -> n1+n2', // Add numbers
              'n1-n2 -> n1-n2', // Subtract numbers
              'n1^n2 -> n1^n2', // Power numbers
              '(n1+n2)+n3 -> n1+(n2+n3)', // Associative addition
              '(n1*n2)*n3 -> n1*(n2*n3)', // Associative multiplication
              'n1*(n2+n3) -> n1*n2+n1*n3', // Distributive property
              'n1*(n2-n3) -> n1*n2-n1*n3', // Distributive property
              'v*0 -> 0', // Multiply by 0
              'v+0 -> v', // Add 0
              'v-0 -> v', // Subtract 0
              'v*1 -> v', // Multiply by 1
              'v/1 -> v', // Divide by 1
              'v^1 -> v', // Power of 1
              'v^0 -> 1', // Power of 0
              '0/v -> 0', // 0 divided by anything
              '0^0 -> 1', // 0^0 = 1
              'v/v -> 1', // Divide by self
              'v-v -> 0', // Subtract self
              'v+v -> 2*v', // Add self
              'v*v -> v^2', // Multiply by self
              'v*v^n -> v^(n+1)', // Multiply by power
              'v^n*v^m -> v^(n+m)', // Multiply powers
              'v^n/v^m -> v^(n-m)', // Divide powers
              '(v^n)^m -> v^(n*m)', // Power of power
              'v+(-v) -> 0', // Add negative
              'v+(-c*v) -> (1-c)*v', // Add negative multiple
              'v+c*v -> (1+c)*v', // Add multiple
              'v-(-v) -> 2*v', // Subtract negative
              'v-c*v -> (1-c)*v', // Subtract multiple
              'c*v+d*v -> (c+d)*v', // Combine like terms
              'c*v-d*v -> (c-d)*v', // Combine like terms
              'v/(-c) -> -v/c', // Divide by negative
              '-(-v) -> v', // Double negative
              '-(v+w) -> -v-w', // Distribute negative
              '-(v-w) -> -v+w', // Distribute negative
              'v*(w/v) -> w', // Cancel in multiplication
              '(w/v)*v -> w', // Cancel in multiplication
              'v/(v*w) -> 1/w', // Cancel in division
              '(v*w)/v -> w', // Cancel in division
              '(v*w)/w -> v', // Cancel in division
              'v*v^(-1) -> 1', // Multiply by reciprocal
              'v^(-1)*v -> 1', // Multiply by reciprocal
              'v/(v) -> 1', // Divide by self
              'v/(-v) -> -1', // Divide by negative self
              '(-v)/v -> -1', // Negative divided by self
              '(-v)/(-v) -> 1', // Negative divided by negative self
              '(v+w)/v -> 1+w/v', // Divide sum
              '(v-w)/v -> 1-w/v', // Divide difference
              'v/(v+w) -> 1/(1+w/v)', // Divide by sum
              'v/(v-w) -> 1/(1-w/v)', // Divide by difference
              'v*(v+w) -> v^2+v*w', // Multiply by sum
              'v*(v-w) -> v^2-v*w', // Multiply by difference
              '(v+w)^2 -> v^2+2*v*w+w^2', // Square of sum
              '(v-w)^2 -> v^2-2*v*w+w^2', // Square of difference
              '(v+w)*(v-w) -> v^2-w^2', // Product of sum and difference
              'v^2-w^2 -> (v+w)*(v-w)', // Difference of squares
              'v^2+2*v*w+w^2 -> (v+w)^2', // Perfect square trinomial (sum)
              'v^2-2*v*w+w^2 -> (v-w)^2', // Perfect square trinomial (difference)
              'v/w+x/w -> (v+x)/w', // Add fractions with same denominator
              'v/w-x/w -> (v-x)/w', // Subtract fractions with same denominator
              'v/(w*x) -> (v/w)/x', // Simplify complex fraction
              '(v/w)/x -> v/(w*x)', // Simplify complex fraction
              'v*(w/x) -> (v*w)/x', // Multiply by fraction
              '(v/w)*x -> (v*x)/w', // Multiply fraction by term
              'v/(w/x) -> (v*x)/w', // Divide by fraction
              '(v/w)/(x/y) -> (v*y)/(w*x)', // Divide fractions
              'v/(w/(x/y)) -> (v*x)/(w*y)', // Divide by complex fraction
              'v*(w/(x*y)) -> (v*w)/(x*y)', // Multiply by complex fraction
              'v/((w*x)/y) -> (v*y)/(w*x)', // Divide by complex fraction
              'v/((w/x)*y) -> (v*x)/(w*y)', // Divide by complex fraction
              'v/((w/x)/(y/z)) -> (v*y*z)/(w*x)', // Divide by complex fraction
              'v/((w*x)/(y*z)) -> (v*y*z)/(w*x)', // Divide by complex fraction
              'v/((w/x)*(y/z)) -> (v*x*z)/(w*y)', // Divide by complex fraction
              'v/((w*x)*(y/z)) -> (v*z)/(w*x*y)', // Divide by complex fraction
              'v/((w/x)/(y*z)) -> (v*x*y*z)/w', // Divide by complex fraction
              'v/((w*x)/(y/z)) -> (v*y)/(w*x*z)', // Divide by complex fraction
              'v/((w/x)*(y*z)) -> (v*x)/(w*y*z)', // Divide by complex fraction
              'v/((w*x)*(y/z)) -> (v*z)/(w*x*y)', // Divide by complex fraction
            ]);
            
            // Try to further simplify fractions
            let simplifiedResult = simplified.toString();
            
            // If the result contains fractions, try to simplify them
            if (simplifiedResult.includes('/')) {
              try {
                const fractionSimplified = math.rationalize(simplifiedResult).toString();
                if (fractionSimplified !== simplifiedResult) {
                  simplifiedResult = fractionSimplified;
                }
              } catch (e) {
                // Keep the original simplification if rationalize fails
              }
            }
            
            // If the result contains square roots, try to simplify them
            if (simplifiedResult.includes('sqrt')) {
              try {
                const sqrtSimplified = math.simplify(simplifiedResult, {}, {exactFractions: false}).toString();
                if (sqrtSimplified !== simplifiedResult && sqrtSimplified.length <= simplifiedResult.length * 1.2) {
                  simplifiedResult = sqrtSimplified;
                }
              } catch (e) {
                // Keep the original simplification if sqrt simplification fails
              }
            }
            
            result = simplifiedResult;
          } catch (mathError) {
            console.log('Math.js simplification failed:', mathError);
            
            // Fall back to Algebrite
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
              // Last resort: try basic math.js simplify
              result = math.simplify(expression).toString();
            }
          }
        } catch (error) {
          throw new Error(`Could not simplify expression: ${error.message}`);
        }
        break;
        
      case 'expand':
        try {
          // Try Wolfram Alpha for complex expansions first
          if (WOLFRAM_APP_ID && (
              expression.includes('^3') || 
              expression.includes('^4') || 
              /[a-df-wyz]/.test(expression))) { // Check for symbolic variables
            try {
              const wolframQuery = `expand ${expression}`;
              const wolframData = await queryWolframAlpha(wolframQuery);
              const wolframResult = extractWolframResult(wolframData, 'Result');
              
              if (wolframResult) {
                result = wolframResult.replace(/\s+/g, ' ').trim();
                break;
              }
            } catch (wolframError) {
              console.log('Wolfram Alpha expansion failed:', wolframError);
            }
          }
          
          // Use math.js if Wolfram Alpha fails or isn't available
          try {
            // Parse the expression
            const node = math.parse(processedExpression);
            
            // Try to expand using math.js
            let expanded;
            
            // Check if it's a product of sums or a power of a sum
            if (processedExpression.includes('(') && processedExpression.includes(')')) {
              // Apply distributive property for products
              expanded = math.simplify(node, [
                'n1*n2 -> n1*n2', // Multiply numbers
                'n1/n2 -> n1/n2', // Divide numbers
                'n1+n2 -> n1+n2', // Add numbers
                'n1-n2 -> n1-n2', // Subtract numbers
                'n1^n2 -> n1^n2', // Power numbers
                'n1*(n2+n3) -> n1*n2+n1*n3', // Distributive property
                'n1*(n2-n3) -> n1*n2-n1*n3', // Distributive property
                '(n1+n2)*n3 -> n1*n3+n2*n3', // Distributive property
                '(n1-n2)*n3 -> n1*n3-n2*n3', // Distributive property
                '(n1+n2)*(n3+n4) -> n1*n3+n1*n4+n2*n3+n2*n4', // Product of sums
                '(n1-n2)*(n3+n4) -> n1*n3+n1*n4-n2*n3-n2*n4', // Product of difference and sum
                '(n1+n2)*(n3-n4) -> n1*n3-n1*n4+n2*n3-n2*n4', // Product of sum and difference
                '(n1-n2)*(n3-n4) -> n1*n3-n1*n4-n2*n3+n2*n4', // Product of differences
                '(n1+n2)^2 -> n1^2+2*n1*n2+n2^2', // Square of sum
                '(n1-n2)^2 -> n1^2-2*n1*n2+n2^2', // Square of difference
                '(n1+n2)^3 -> n1^3+3*n1^2*n2+3*n1*n2^2+n2^3', // Cube of sum
                '(n1-n2)^3 -> n1^3-3*n1^2*n2+3*n1*n2^2-n2^3', // Cube of difference
                '(n1+n2+n3)^2 -> n1^2+n2^2+n3^2+2*n1*n2+2*n1*n3+2*n2*n3', // Square of trinomial
              ]);
            } else {
              // For simpler expressions
              expanded = math.simplify(node);
            }
            
            // If the expansion didn't change anything, try a different approach
            if (expanded.toString() === processedExpression) {
              // Try using math.js expand function if available
              if (typeof math.expand === 'function') {
                expanded = math.expand(node);
              } else {
                // Apply more aggressive simplification rules
                expanded = math.simplify(node, ['all']);
              }
            }
            
            // If still no change, try our custom expansion
            if (expanded.toString() === processedExpression) {
              const customExpansion = expandPolynomial(expression);
              if (customExpansion) {
                result = customExpansion;
                break;
              }
            }
            
            result = expanded.toString();
          } catch (mathError) {
            console.log('Math.js expansion failed:', mathError);
            
            // Fall back to Algebrite
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
              
              result = expanded;
            } catch (algebriteError) {
              console.log('Algebrite expansion failed:', algebriteError);
              
              // Try our custom expansion as last resort
              const customExpansion = expandPolynomial(expression);
              if (customExpansion) {
                result = customExpansion;
              } else {
                // Fall back to basic math.js
                const expandedExpr = math.parse(expression);
                result = math.simplify(expandedExpr).toString();
              }
            }
          }
        } catch (error) {
          throw new Error(`Could not expand expression: ${error.message}`);
        }
        break;
        
      case 'factor':
        try {
          // Try Wolfram Alpha for complex factoring first
          if (WOLFRAM_APP_ID && (
              expression.includes('^3') || 
              expression.includes('^4') || 
              /[a-df-wyz]/.test(expression))) { // Check for symbolic variables
            try {
              const wolframQuery = `factor ${expression}`;
              const wolframData = await queryWolframAlpha(wolframQuery);
              const wolframResult = extractWolframResult(wolframData, 'Factored form');
              
              if (!wolframResult) {
                // Try alternate pod titles
                const altResult = extractWolframResult(wolframData, 'Result');
                if (altResult) {
                  result = altResult.replace(/\s+/g, ' ').trim();
                  break;
                }
              } else {
                result = wolframResult.replace(/\s+/g, ' ').trim();
                break;
              }
            } catch (wolframError) {
              console.log('Wolfram Alpha factoring failed:', wolframError);
            }
          }
          
          // Use math.js for factoring if Wolfram Alpha fails or isn't available
          try {
            // First try to identify common factoring patterns using math.js
            const node = math.parse(processedExpression);
            
            // Try to factor using math.js simplify with factoring rules
            let factored = math.simplify(node, [
              'n1^2-n2^2 -> (n1+n2)*(n1-n2)', // Difference of squares
              'n1^2+2*n1*n2+n2^2 -> (n1+n2)^2', // Perfect square trinomial (sum)
              'n1^2-2*n1*n2+n2^2 -> (n1-n2)^2', // Perfect square trinomial (difference)
              'n1^3+n2^3 -> (n1+n2)*(n1^2-n1*n2+n2^2)', // Sum of cubes
              'n1^3-n2^3 -> (n1-n2)*(n1^2+n1*n2+n2^2)', // Difference of cubes
              'n1*n3+n2*n3 -> (n1+n2)*n3', // Common factor
              'n1*n3-n2*n3 -> (n1-n2)*n3', // Common factor
            ]);
            
            // If factoring didn't change anything, try a different approach
            if (factored.toString() === processedExpression) {
              // Try to identify quadratic expressions
              if (processedExpression.includes('^2')) {
                // Try to extract coefficients for ax^2 + bx + c
                const expr = math.simplify(processedExpression);
                const exprStr = expr.toString();
                
                // Extract coefficients using regex
                const aMatch = exprStr.match(new RegExp(`([+-]?\\s*[0-9.]*\\s*\\*?\\s*${variable}\\s*\\^\\s*2)`, 'g'));
                const bMatch = exprStr.match(new RegExp(`([+-]?\\s*[0-9.]*\\s*\\*?\\s*${variable}(?!\\s*\\^))`, 'g'));
                const cMatch = exprStr.match(new RegExp(`([+-]?\\s*[0-9.]+)(?!\\s*\\*?\\s*${variable})`, 'g'));
                
                if (aMatch) {
                  const a = math.evaluate(aMatch[0].replace(new RegExp(`\\*?\\s*${variable}\\s*\\^\\s*2`, 'g'), '')) || 1;
                  const b = bMatch ? math.evaluate(bMatch[0].replace(new RegExp(`\\*?\\s*${variable}`, 'g'), '')) || 1 : 0;
                  const c = cMatch ? math.evaluate(cMatch[0]) : 0;
                  
                  // Check if it can be factored (discriminant is perfect square)
                  const discriminant = b * b - 4 * a * c;
                  
                  if (discriminant >= 0 && Math.sqrt(discriminant) % 1 === 0) {
                    // Can be factored with rational roots
                    const sqrtDisc = Math.sqrt(discriminant);
                    const r1 = (-b + sqrtDisc) / (2 * a);
                    const r2 = (-b - sqrtDisc) / (2 * a);
                    
                    // Format the factored form
                    if (a === 1) {
                      factored = `(${variable}${r1 >= 0 ? '-' + r1 : '+' + (-r1)})(${variable}${r2 >= 0 ? '-' + r2 : '+' + (-r2)})`;
                    } else {
                      factored = `${a}(${variable}${r1 >= 0 ? '-' + r1 : '+' + (-r1)})(${variable}${r2 >= 0 ? '-' + r2 : '+' + (-r2)})`;
                    }
                  }
                }
              }
            }
            
            // If math.js factoring didn't work, fall back to Algebrite
            if (factored.toString() === processedExpression) {
              throw new Error('Math.js factoring insufficient');
            }
            
            result = factored.toString();
          } catch (mathError) {
            console.log('Math.js factoring failed:', mathError);
            
            // Fall back to Algebrite for factoring
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
              
              // Try to parse the value as a number or expression
              try {
                scope[varName] = math.evaluate(value);
              } catch (e) {
                scope[varName] = value; // Keep as string if not evaluable
              }
            });
            
            // Try to evaluate with mathjs
            try {
              // Create a scope with default values for common variables
              const fullScope = {
                a: 1, b: 1, c: 1, d: 1, m: 1, n: 1, p: 1, q: 1, r: 1, s: 1, t: 1,
                ...scope
              };
              
              // First simplify the expression
              const simplified = math.simplify(expr).toString();
              
              // Then evaluate with the scope
              result = math.evaluate(simplified, fullScope);
              
              // Format the result nicely
              if (typeof result === 'number') {
                // For floating point precision issues
                if (Math.abs(result - Math.round(result)) < 1e-10) {
                  result = Math.round(result);
                }
                result = math.format(result, {precision: 14});
              }
            } catch (mathError) {
              console.log('Math.js evaluation failed:', mathError);
              
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
              // Create a default scope with common variables
              const defaultScope = {
                a: 1, b: 1, c: 1, d: 1, m: 1, n: 1, p: 1, q: 1, r: 1, s: 1, t: 1,
                x: 1, y: 1, z: 1
              };
              
              // First simplify the expression
              const simplified = math.simplify(expression).toString();
              
              // Check if this is a symbolic expression (contains letters)
              const hasVariables = /[a-zA-Z]/.test(simplified);
              
              if (hasVariables) {
                // For symbolic expressions, use Algebrite instead
                result = algebrite.run(`${processedExpression}`).toString();
              } else {
                // For numeric expressions, use math.js
                result = math.evaluate(simplified, defaultScope);
                
                // Format the result nicely
                if (typeof result === 'number') {
                  // For floating point precision issues
                  if (Math.abs(result - Math.round(result)) < 1e-10) {
                    result = Math.round(result);
                  }
                  result = math.format(result, {precision: 14});
                }
              }
            } catch (mathError) {
              console.log('Math.js evaluation failed:', mathError);
              
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
        try {
          // For graphing, we'll return data points that can be plotted on the client side
          const [expr, rangeStr] = expression.includes('@') 
            ? expression.split('@').map(part => part.trim())
            : [expression, 'x=-10:10'];
          
          // Parse the range
          let variable = 'x';
          let min = -10;
          let max = 10;
          let points = 100;
          
          if (rangeStr) {
            const rangeMatch = rangeStr.match(/([a-zA-Z])=(-?[\d.]+):(-?[\d.]+)(?::(\d+))?/);
            if (rangeMatch) {
              [, variable, min, max, points] = rangeMatch;
              min = parseFloat(min);
              max = parseFloat(max);
              points = points ? parseInt(points) : 100;
            }
          }
          
          // Generate data points
          const step = (max - min) / points;
          const dataPoints = [];
          
          try {
            // Compile the expression for faster evaluation
            const compiledExpr = math.compile(expr);
            
            for (let i = 0; i <= points; i++) {
              const x = min + i * step;
              try {
                const y = compiledExpr.evaluate({ [variable]: x });
                if (!isNaN(y) && isFinite(y)) {
                  dataPoints.push({ x, y });
                }
              } catch (e) {
                // Skip points that can't be evaluated
              }
            }
            
            // Return the data points as JSON
            result = JSON.stringify({
              expression: expr,
              variable,
              range: { min, max },
              points: dataPoints
            });
          } catch (mathError) {
            throw new Error(`Could not graph expression: ${mathError.message}`);
          }
        } catch (error) {
          result = "Could not graph the expression. Check the syntax and try again.";
        }
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
