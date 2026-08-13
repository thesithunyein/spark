// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SparkCredit
 * @notice Testnet credit units minted on withdraw; burned on redeem.
 *         Not real money — stands in until a funded pool exists.
 */
contract SparkCredit {
    string public constant name = "Spark Credit";
    string public constant symbol = "sCREDIT";
    uint8 public constant decimals = 18;

    address public immutable minter;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error NotMinter();
    error BadAmount();

    constructor(address minter_) {
        require(minter_ != address(0), "minter");
        minter = minter_;
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        if (amount == 0) revert BadAmount();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount) external {
        if (msg.sender != minter) revert NotMinter();
        if (amount == 0) revert BadAmount();
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "to");
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
