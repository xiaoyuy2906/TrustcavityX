from tidy3d import web

def add(a: float, b: float) -> float:
    return a + b

def getFlexCredit():
    a = web.account()
    return {'left': a.credit, 'expire': a.credit_expiration}

def getAllowance():
    a = web.account()
    return {'left': a.allowance_current_cycle_amount, 'refresh': a.allowance_current_cycle_end_date}



