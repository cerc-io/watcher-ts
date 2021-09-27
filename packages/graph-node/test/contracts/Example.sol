pragma solidity >=0.4.22 <0.8.0;

contract Example  {
    event Test(string param1, uint param2);

    function getMethod() public view virtual returns (string memory)
    {
        return 'test';
    }
}
